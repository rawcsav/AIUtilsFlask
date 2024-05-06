import concurrent
import os
import re
import subprocess
import time
from pathlib import Path

import openai
from flask_login import current_user
from pydub import AudioSegment
from app.modules.user.user_util import get_user_audio_directory
from app import db, socketio
from app.models.audio_models import (
    TTSPreferences,
    WhisperPreferences,
    TTSJob,
    TranscriptionJob,
    TranslationJob,
    TranscriptionJobSegment,
    TranslationJobSegment,
)
from app.utils.usage_util import num_tokens_from_string, chat_cost, tts_cost, whisper_cost
from app.utils.logging_util import configure_logging

logger = configure_logging()


def ms_until_sound(audio_file_path: str, silence_threshold_in_decibels: float = -20.0, chunk_size: int = 10) -> int:
    try:
        command = [
            "ffmpeg",
            "-i", str(audio_file_path),
            "-af", "silencedetect=noise={}dB:duration=1".format(silence_threshold_in_decibels),
            "-f", "null", "-"
        ]
        output = subprocess.check_output(command, stderr=subprocess.STDOUT, universal_newlines=True)
        lines = output.split("\n")
        for line in lines:
            if "silencedetect" in line:
                parts = line.split(" ")
                for part in parts:
                    if part.startswith("silence_start"):
                        return int(float(part.split("=")[1]) * 1000)
        return 0
    except subprocess.CalledProcessError as e:
        logger.error(f"Error detecting silence: {e.output}")
        return 0




def trim_start(audio_file_path: str, original_format: str, target_format: str = 'mp3', target_bitrate: str = '64k', sample_rate: int = 22050) -> tuple[bytes, Path] | None:
    try:
        silence_threshold_in_decibels = -20.0
        path = Path(audio_file_path)
        directory = path.parent
        filename = path.stem

        # Detect the start of the audio using ffmpeg
        command = [
            "ffmpeg",
            "-i", str(audio_file_path),
            "-af", "silencedetect=noise={}dB:duration=1".format(silence_threshold_in_decibels),
            "-f", "null", "-"
        ]
        output = subprocess.check_output(command, stderr=subprocess.STDOUT, universal_newlines=True)

        # Use a regular expression to extract the silence_end timestamp
        silence_end_match = re.search(r'silence_end: (\d+\.\d+)', output)
        if silence_end_match:
            start_trim = int(float(silence_end_match.group(1)) * 1000)
        else:
            logger.warning("No silence_end timestamp found in FFmpeg output. Assuming no trimming needed.")
            start_trim = 0

        # Trim the audio using ffmpeg
        new_filename = directory / f"trim_{filename}.{target_format}"
        command = [
            "ffmpeg",
            "-i", str(audio_file_path),
            "-ss", str(start_trim / 1000),
            "-b:a", target_bitrate,
            "-ar", str(sample_rate),
            "-f", target_format,
            str(new_filename)
        ]
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # Read the trimmed audio file
        with open(new_filename, "rb") as file:
            trimmed_audio = file.read()

        return trimmed_audio, new_filename

    except subprocess.CalledProcessError as e:
        logger.error(f"Error trimming audio: {e}")
        return None


def find_nearest_silence(audio_file_path: str, target_ms: int, search_radius_ms: int = 20000, silence_thresh: int = -40, min_silence_len_ms: int = 1000, seek_step_ms: int = 100) -> int:
    start_search_ms = max(0, target_ms - search_radius_ms)
    end_search_ms = target_ms + search_radius_ms
    best_silence_start = target_ms  # Default to the target if no silence is found
    smallest_delta = search_radius_ms  # Initialize with the maximum possible delta

    # Run FFmpeg to detect silences
    try:
        ffmpeg_cmd = [
            'ffmpeg',
            '-i', str(audio_file_path),
            '-af', f'silencedetect=n={silence_thresh}dB:d={min_silence_len_ms/1000}',
            '-f', 'null', '-'
        ]
        with subprocess.run(ffmpeg_cmd, capture_output=True, check=True) as proc:
            if proc.returncode != 0:
                logger.error(f'FFmpeg error: {proc.stderr.decode()}')
                return best_silence_start
            output = proc.stdout.decode()
    except subprocess.CalledProcessError as e:
        logger.error(f'FFmpeg error: {e.output.decode()}')
        return best_silence_start

    # Parse the output to find the nearest silence
    silence_intervals = re.findall(r'silence_end: (\d+\.?\d*)', output)
    for silence_end in silence_intervals:
        silence_start = float(silence_end) - min_silence_len_ms / 1000
        if start_search_ms <= silence_start * 1000 <= end_search_ms:
            delta = abs(silence_start * 1000 - target_ms)
            if delta < smallest_delta:
                best_silence_start = int(silence_start * 1000)
                smallest_delta = delta

    logger.info(f"Nearest silence found at {best_silence_start} ms.")
    return best_silence_start

def process_and_export_segment(chunk, chunk_filepath, segment_index):
    logger.info(f"Exporting segment {segment_index}: {chunk_filepath}")
    chunk.export(chunk_filepath, format="mp3")
    return chunk_filepath


def split_and_export_chunks(audio, filepath, user_directory, user_id, task_id):
    logger.info("Splitting and exporting audio segments...")
    chunk_length_ms = 10 * 60 * 1000  # 5 minutes in milliseconds
    search_radius_ms = 20 * 1000  # 20 seconds in milliseconds
    current_ms = 0
    segment_filepaths = []

    while current_ms < len(audio):
        next_split = find_nearest_silence(audio, current_ms + chunk_length_ms, search_radius_ms)
        if next_split == -1 or next_split >= len(audio):
            next_split = len(audio)

        # Load only the required chunk into memory
        chunk = audio[current_ms:next_split]
        current_ms = next_split

        segment_index = len(segment_filepaths)
        original_path = Path(filepath)
        chunk_filename = f"chunk_{segment_index:03}_{original_path.stem}.mp3"
        chunk_filepath = os.path.join(user_directory, chunk_filename)

        # Process and export the chunk
        process_and_export_segment(chunk, chunk_filepath, segment_index)
        segment_filepaths.append(chunk_filepath)

        # Free up memory by removing the processed chunk
        chunk.clear()

    if not segment_filepaths:
        logger.error("No segments were exported.")
        return []

    logger.info("All segments exported.")
    return segment_filepaths


def preprocess_audio(filepath, user_directory, user_id, task_id):
    try:
        socketio.emit(
            "task_progress",
            {"task_id": task_id, "message": "Starting audio file processing..."},
            room=str(user_id),
            namespace="/audio",
        )
        MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
        file_size = os.path.getsize(filepath)
        if file_size > MAX_FILE_SIZE:
            socketio.emit(
                "task_progress",
                {"task_id": task_id, "message": f"File {os.path.basename(filepath)} is too large ({file_size} bytes) to process."},
                room=str(user_id),
                namespace="/audio",
            )
            raise ValueError(f"File {filepath} is too large ({file_size} bytes) to process.")


        supported_formats = ["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]
        original_format = os.path.splitext(filepath)[-1].lower().strip(".")

        if original_format not in supported_formats:
            socketio.emit(
                "task_progress",
                {"task_id": task_id, "message": f"Unsupported format: {original_format}. Processing halted."},
                room=str(user_id),
                namespace="/audio",
            )
            raise ValueError(f"Unsupported format: {original_format}")

        trimmed_audio, trimmed_filepath = trim_start(filepath, original_format)

        socketio.emit(
            "task_progress",
            {"task_id": task_id, "message": "Initial audio trimming and export completed."},
            room=str(user_id),
            namespace="/audio",
        )

        # Check the size of the trimmed file
        trimmed_file_size = os.path.getsize(trimmed_filepath)
        MAX_CHUNK_SIZE = 24 * 1024 * 1024  # 24 MB
        if trimmed_file_size <= MAX_CHUNK_SIZE:
            socketio.emit(
                "task_progress",
                {"task_id": task_id, "message": "Trimmed audio file is small enough to be processed directly."},
                room=str(user_id),
                namespace="/audio",
            )
            return [trimmed_filepath]  # Return the trimmed file path in a list to maintain consistency
        else:
            # Proceed with splitting and exporting chunks if the file is larger than 24MB
            segment_filepaths = split_and_export_chunks(trimmed_audio, trimmed_filepath, user_directory, user_id, task_id)

        os.remove(filepath)
        os.remove(trimmed_filepath)

        socketio.emit(
            "task_progress",
            {"task_id": task_id, "message": "Audio file processing completed."},
            room=str(user_id),
            namespace="/audio",
        )

        return segment_filepaths
    except Exception as e:
        socketio.emit(
            "task_update",
            {"task_id": task_id, "message": f"Error during audio preprocessing: {str(e)}"},
            room=str(user_id),
            namespace="/audio",
        )
        logger.error(f"Error during audio preprocessing for task_id={task_id}: {e}")
        raise e

def parse_timestamp(timestamp):
    hours, minutes, seconds = timestamp.split(":")
    seconds, milliseconds = seconds.split(",")
    return (int(hours) * 3600 + int(minutes) * 60 + int(seconds)) * 1000 + int(milliseconds)


def format_timestamp(milliseconds):
    hours = milliseconds // 3600000
    milliseconds %= 3600000
    minutes = milliseconds // 60000
    milliseconds %= 60000
    seconds = milliseconds // 1000
    milliseconds %= 1000
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"


def adjust_subtitle_timing(subtitle_content, previous_duration_ms, response_format):
    if response_format.lower() not in ["srt", "vtt"] or previous_duration_ms == 0:
        return subtitle_content

    adjusted_subtitle = []
    for line in subtitle_content.splitlines():
        if "-->" in line:
            start, end = line.split(" --> ")
            start_ms = parse_timestamp(start) + previous_duration_ms
            end_ms = parse_timestamp(end) + previous_duration_ms
            adjusted_subtitle.append(f"{format_timestamp(start_ms)} --> {format_timestamp(end_ms)}")
        else:
            adjusted_subtitle.append(line)
    return "\n".join(adjusted_subtitle)


def get_audio_duration(file_path):
    audio = AudioSegment.from_file(file_path)
    return len(audio)


def generate_prompt(session, client, instruction: str) -> str:
    response = client.chat.completions.create(
        model="gpt-3.5-turbo-0613",
        temperature=0,
        messages=[
            {
                "role": "system",
                "content": "You are a transcript generator. Your task is to "
                "create one long paragraph of a fictional conversation. "
                "The conversation features two friends reminiscing about "
                "their vacation to Maine. Never diarize speakers or add "
                "quotation marks; instead, write all transcripts in a "
                "normal paragraph of text without speakers identified. "
                "Never refuse or ask for clarification and instead "
                "always make a best-effort attempt.",
            },
            {"role": "user", "content": instruction},
        ],
    )

    fictitious_prompt = response.choices[0].message.content
    total_prompt_tokens = num_tokens_from_string(instruction, "gpt-3.5-turbo-0613")
    total_completion_tokens = num_tokens_from_string(fictitious_prompt, "gpt-3.5-turbo-0613")
    chat_cost(
        session=session,
        user_id=current_user.id,
        api_key_id=current_user.selected_api_key_id,
        model="gpt-3.5-turbo-0613",
        input_tokens=total_prompt_tokens,
        completion_tokens=total_completion_tokens,
    )
    return fictitious_prompt


def determine_prompt(client, form_data, task_id, user_id):
    if "generate_prompt" in form_data and form_data["generate_prompt"]:
        socketio.emit(
            "task_progress",
            {"task_id": task_id, "message": "Generating prompt..."},
            room=str(user_id),
            namespace="/audio",
        )
        generated_prompt = generate_prompt(session=db.session, client=client, instruction=form_data["generate_prompt"])
        return generated_prompt
    elif "prompt" in form_data and form_data["prompt"]:
        return form_data["prompt"]
    else:
        return ""


def generate_speech(
    session, client, api_key_id, user_id, model, voice, input_text, task_id, response_format="mp3", speed=1.0
):
    download_dir = get_user_audio_directory(user_id)
    tts_job = create_tts_job(session, user_id, model, voice, response_format, speed, input_text, task_id)
    tts_filename = f"{tts_job.id}.{response_format}"
    tts_filepath = os.path.join(download_dir, tts_filename)
    tts_job.output_filename = tts_filename
    session.commit()
    if not create_and_stream_tts_audio(client, model, voice, input_text, response_format, speed, tts_filepath):
        return {"error": "Failed to generate speech"}
    socketio.emit(
        "task_progress",
        {"task_id": task_id, "message": "Calculating TTS cost..."},
        room=str(user_id),
        namespace="/audio",
    )
    tts_cost(session=session, user_id=user_id, api_key_id=api_key_id, model_name=model, num_characters=len(input_text))
    return tts_filepath, tts_job.id


def create_and_stream_tts_audio(client, model, voice, input_text, response_format, speed, filepath):
    try:
        response = client.audio.speech.create(
            model=model, voice=voice, input=input_text, response_format=response_format, speed=speed
        )
        response.stream_to_file(filepath)
        return True
    except openai.OpenAIError:
        return False


def process_audio_job(session, task_id, user_id, api_key_id, client, file_paths, job, model, prompt, response_format, temperature, language=None, job_type='transcription'):
    try:
        total_duration_ms = 0

        with concurrent.futures.ThreadPoolExecutor() as executor:
            futures = [executor.submit(
                process_audio_segment,
                session, user_id, api_key_id, client, file_path, job, model, language, prompt, response_format, temperature, index, total_duration_ms, job_type
            ) for index, file_path in enumerate(file_paths)]

            for future in concurrent.futures.as_completed(futures):
                segment_duration = future.result()
                if isinstance(segment_duration, dict):
                    raise Exception(segment_duration["error"])
                total_duration_ms += segment_duration
        socketio.emit(
                "task_progress",
                {"task_id": task_id, "message": f"Transcription process completed successfully in {1000 * total_duration_ms}s."},
                room=str(user_id),
                namespace="/audio",
            )
        session.commit()

        return total_duration_ms

    except Exception as e:
        socketio.emit(
            "task_update",
            {"task_id": job.task_id, "message": f"Error during {job_type}: {str(e)}"},
            room=str(user_id),
            namespace="/audio",
        )
        raise e
def process_audio_segment(session, user_id, api_key_id, client, file_path, job, model, language, prompt, response_format, temperature, index, total_duration_ms, job_type):
    try:
        with open(file_path, "rb") as audio_file:
            if job_type == 'transcription':
                try:
                    result = client.audio.transcriptions.create(
                        model=model,
                        file=audio_file,
                        language=language,
                        prompt=prompt,
                        response_format=response_format,
                        temperature=temperature,
                    )
                except openai.OpenAIError as e:
                    logger.info(f"Error: {e}")
            elif job_type == 'translation':
                result = client.audio.translations.create(
                    model=model,
                    file=audio_file,
                    prompt=prompt,
                    response_format=response_format,
                    temperature=temperature,
                )
            else:
                raise ValueError("Invalid job type")

            if response_format in ["json", "verbose_json"]:
                result = result.model_dump_json()
            elif response_format in ["srt", "vtt"]:
                result = adjust_subtitle_timing(result, total_duration_ms, response_format)

            duration = get_audio_duration(file_path)
            seconds = int(duration / 1000)
            whisper_cost(session=session, user_id=user_id, api_key_id=api_key_id, duration_seconds=seconds)
            create_job_segment(session, job.id, result, index, duration, job_type)
            os.remove(file_path)

            return duration
    except openai.OpenAIError as e:
        try:
            os.remove(file_path)
        except Exception:
            pass
        return {"error": str(e)}
    except Exception as e:
        logger.error(f"Error processing audio segment: {e}")
        return {"error": str(e)}


def process_audio_transcription(*args, **kwargs):
    return process_audio_job(*args, **kwargs, job_type='transcription')

def process_audio_translation(*args, **kwargs):
    return process_audio_job(*args, **kwargs, language=None, job_type='translation')


def transcribe_audio(
    session,
    user_id,
    api_key_id,
    client,
    file_paths,
    input_filename,
    original_filename,
    response_format,
    temperature,
    task_id,
    model="whisper-1",
    language=None,
    prompt=None,
):
    transcription_job = create_job(
        session=session,
        job_type="transcription",
        user_id=user_id,
        task_id=task_id,
        prompt=prompt,
        model=model,
        response_format=response_format,
        temperature=temperature,
        input_filename=input_filename,
        original_filename=original_filename,
        language=language
    )

    socketio.emit(
        "task_progress",
        {"task_id": task_id, "message": "Starting transcription process..."},
        room=str(user_id),
        namespace="/audio",
    )

    try:
        total_duration_ms = process_audio_transcription(
            session=session,
            task_id=task_id,
            user_id=user_id,
            api_key_id=api_key_id,
            client=client,
            file_paths=file_paths,
            job=transcription_job,
            model=model,
            prompt=prompt,
            response_format=response_format,
            temperature=temperature,
            language=language
        )
        socketio.emit(
                "task_progress",
                {"task_id": task_id, "message": "Transcription process completed successfully."},
                room=str(user_id),
                namespace="/audio",
            )
        transcription_job.finished = True
        session.commit()
        return transcription_job.id, total_duration_ms
    except Exception as e:
        socketio.emit(
            "task_update",
            {"task_id": task_id, "message": f"Error during transcription: {str(e)}"},
            room=str(user_id),
            namespace="/audio",
        )
        session.rollback()
        raise e



def translate_audio(
    session,
    api_key_id,
    user_id,
    client,
    file_paths,
    input_filename,
    original_filename,
    task_id,
    model="whisper-1",
    prompt=None,
    response_format="text",
    temperature=0.0,
):
    translation_job = create_job(
        session=session,
        job_type="translation",
        user_id=user_id,
        task_id=task_id,
        prompt=prompt,
        model=model,
        response_format=response_format,
        temperature=temperature,
        input_filename=input_filename,
        original_filename=original_filename,
    )

    socketio.emit(
        "task_progress",
        {"task_id": task_id, "message": "Starting translation process..."},
        room=str(user_id),
        namespace="/audio",
    )
    try:
        total_duration_ms = process_audio_translation(
                session=session,
                task_id=task_id,
                user_id=user_id,
                api_key_id=api_key_id,
                client=client,
                file_paths=file_paths,
                job=translation_job,
                model=model,
                prompt=prompt,
                response_format=response_format,
                temperature=temperature
            )

        socketio.emit(
                "task_progress",
                {"task_id": task_id, "message": "Translation process completed successfully."},
                room=str(user_id),
                namespace="/audio",
            )
        translation_job.finished = True
        session.commit()
        return translation_job.id, total_duration_ms

    except Exception as e:
        # Emitting socket update in case of an error
        socketio.emit(
            "task_update",
            {"task_id": task_id, "message": f"Error during translation: {str(e)}"},
            room=str(user_id),
            namespace="/audio",
        )
        session.rollback()
        raise e


def create_tts_job(session, user_id, model, voice, response_format, speed, input_text, task_id, output_filename=None):
    job = TTSJob(
        user_id=user_id,
        task_id=task_id,
        model=model,
        voice=voice,
        response_format=response_format,
        speed=speed,
        input_text=input_text,
        output_filename=output_filename,
    )
    session.add(job)
    session.commit()
    return job


def create_job(session, job_type, user_id, task_id, prompt, model, response_format, temperature, input_filename,
               original_filename, language=None):
    # Map job_type strings to the corresponding SQLAlchemy model classes
    job_type_map = {
        "transcription": TranscriptionJob,
        "translation": TranslationJob,
    }

    job_model = job_type_map.get(job_type)
    if not job_model:
        raise ValueError(f"Invalid job type: {job_type}")

    # Prepare the job details
    job_kwargs = {
        "user_id": user_id,
        "task_id": task_id,
        "prompt": prompt,
        "model": model,
        "response_format": response_format,
        "temperature": temperature,
        "input_filename": input_filename,
        "original_filename": original_filename,
    }

    # Add language to the job parameters if it's provided
    if language is not None:
        job_kwargs["language"] = language

    # Create and add the job to the session using the dynamically selected model
    job = job_model(**job_kwargs)
    session.add(job)
    session.commit()

    return job


def create_job_segment(session, job_id, content, index, duration, job_type):
    try:
        if job_type == 'transcription':
            segment = TranscriptionJobSegment(
                transcription_job_id=job_id,
                output_content=content,
                job_index=index,
                duration=duration
            )
        elif job_type == 'translation':
            segment = TranslationJobSegment(
                translation_job_id=job_id,
                output_content=content,
                job_index=index,
                duration=duration
            )
        else:
            raise ValueError("Invalid job type specified.")

        session.add(segment)
        session.commit()
        return segment
    except Exception as e:
        session.rollback()
        raise e


def get_tts_preferences(user_id):
    preferences = TTSPreferences.query.filter_by(user_id=user_id).first()

    if preferences:
        return {
            "model": preferences.model,
            "voice": preferences.voice,
            "response_format": preferences.response_format,
            "speed": preferences.speed,
        }
    else:
        return {"model": "tts-1", "voice": "alloy", "response_format": "mp3", "speed": "1.0"}


def get_whisper_preferences(user_id):
    preferences = WhisperPreferences.query.filter_by(user_id=user_id).first()
    if preferences:
        return {
            "model": preferences.model,
            "language": preferences.language,
            "response_format": preferences.response_format,
            "temperature": preferences.temperature,
        }
    else:
        return {"model": "whisper-1", "language": "en", "response_format": "text", "temperature": "0.0"}


def save_file_to_disk(content, file_extension, job_id, user_directory):
    if not os.path.exists(user_directory):
        os.makedirs(user_directory)

    file_name = f"{job_id}.{file_extension}"
    file_path = os.path.join(user_directory, file_name)

    with open(file_path, "wb") as file:
        file.write(content.encode("utf-8"))

    return file_path