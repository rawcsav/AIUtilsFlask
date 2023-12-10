from time import sleep

import numpy as np
import openai
import tiktoken

from app import db
from app.database import ChatPreferences, Message, Conversation

MODEL_TOKEN_LIMITS = {
    'gpt-4-1106-preview': 128000,
    'gpt-4-vision-preview': 128000,
    'gpt-4': 8192,
    'gpt-4-32k': 32768,
    'gpt-4-0613': 8192,
    'gpt-4-32k-0613': 32768,
    'gpt-4-0314': 8192,
    'gpt-4-32k-0314': 32768,
    'gpt-3.5-turbo-1106': 16385,
    'gpt-3.5-turbo': 4096,
    'gpt-3.5-turbo-16k': 16385,
}

ENCODING = tiktoken.get_encoding("cl100k_base")


def cosine_similarity(a, b):
    return np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))


def get_truncate_limit(model_name):
    model_max_tokens = MODEL_TOKEN_LIMITS.get(model_name)
    if model_max_tokens:
        return int(model_max_tokens * 0.85)
    else:
        return int(4096 * 0.85)


def get_token_count(conversation_history, encoding=ENCODING):
    num_tokens = 0
    for message in conversation_history:
        num_tokens += 5
        for key, value in message.items():
            if value:
                num_tokens += len(encoding.encode(value))
            if key == "name":
                num_tokens += 5
    num_tokens += 5
    return num_tokens


def truncate_conversation(conversation_history, truncate_limit):
    while True:
        if get_token_count(conversation_history, ENCODING) > truncate_limit and len(
                conversation_history) > 1:
            conversation_history.pop(1)
        else:
            break


def save_system_prompt(user_id, conversation_id, system_prompt):
    conversation = Conversation.query.filter_by(user_id=user_id,
                                                id=conversation_id).first()
    if conversation:
        conversation.system_prompt = system_prompt
        try:
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            raise e


def get_user_conversation(user_id, conversation_id):
    conversation = Conversation.query.filter_by(user_id=user_id,
                                                id=conversation_id).first()
    if conversation:
        conversation_history = []
        system_prompt = conversation.system_prompt
        if system_prompt:
            conversation_history.append({
                "role": "system",
                "content": system_prompt
            })

        messages = Message.query.filter_by(conversation_id=conversation.id).all()
        for message in messages:
            conversation_history.append({
                "role": "assistant" if message.direction == 'incoming' else "user",
                "content": message.content
            })

        return conversation, conversation_history
    else:
        return None, []


def get_user_preferences(user_id):
    preferences = ChatPreferences.query.filter_by(user_id=user_id).first()

    if preferences:
        model_name = preferences.model if preferences.model else 'gpt-3.5-turbo'
        max_token_limit = MODEL_TOKEN_LIMITS.get(model_name, 4096)
        model_max_tokens = int(max_token_limit * 0.5)
        truncate_limit = get_truncate_limit(model_name)

        # Use the preferences max_tokens if set, otherwise use the model_max_tokens
        max_tokens = preferences.max_tokens if preferences.max_tokens else model_max_tokens

        return {
            "model": model_name,
            "temperature": preferences.temperature,
            "max_tokens": max_tokens,
            "frequency_penalty": preferences.frequency_penalty,
            "presence_penalty": preferences.presence_penalty,
            "top_p": preferences.top_p,
            "stream": preferences.stream,
            "truncate_limit": truncate_limit,
        }
    else:
        return {
            "model": 'gpt-3.5-turbo',
            "temperature": 0.7,
            "max_tokens": 2048,
            "frequency_penalty": 0.0,
            "presence_penalty": 0.0,
            "top_p": 1.0,
            "stream": True,
            "truncate_limit": int(4096 * 0.85),
        }


# Utility function to save a message to the database
def save_message(conversation_id, content, direction, model, is_knowledge_query=False):
    message = Message(
        conversation_id=conversation_id,
        content=content,
        direction=direction,
        model=model,
        is_knowledge_query=is_knowledge_query
    )
    db.session.add(message)
    try:
        db.session.commit()
    except Exception as e:
        db.session.rollback()
        raise e


def chat_stream(prompt, client, user_id, conversation_id):
    conversation, conversation_history = get_user_conversation(user_id, conversation_id)
    if not conversation:
        print("No conversation found for user.")
        return

    preferences = get_user_preferences(user_id)
    truncate_limit = preferences["truncate_limit"]

    truncate_conversation(conversation_history, truncate_limit)
    full_response = ""
    try:
        response = client.chat.completions.create(
            model=preferences["model"],
            messages=conversation_history + [{"role": "user", "content": prompt}],
            temperature=preferences["temperature"],
            max_tokens=preferences["max_tokens"],
            frequency_penalty=preferences["frequency_penalty"],
            presence_penalty=preferences["presence_penalty"],
            top_p=preferences["top_p"],
            stream=True,
        )
        for part in response:
            content = part.choices[0].delta.content
            if content:
                full_response += content
                print(content, end="")
    except openai.RateLimitError as e:
        print("Rate limit reached. Sleeping for a minute...")
        print(e)
        sleep(10)
    except Exception as e:
        print(f"An error occurred: {e}")

    print("\n")
    return full_response


def chat_nonstream(prompt, client, user_id, conversation_id):
    conversation, conversation_history = get_user_conversation(user_id, conversation_id)
    if not conversation:
        print("No conversation found for user.")
        return

    preferences = get_user_preferences(user_id)
    truncate_limit = preferences["truncate_limit"]
    full_response = ""
    truncate_conversation(conversation_history, truncate_limit)
    try:
        response = client.chat.completions.create(
            model=preferences["model"],
            messages=conversation_history + [{"role": "user", "content": prompt}],
            temperature=preferences["temperature"],
            max_tokens=preferences["max_tokens"],
            frequency_penalty=preferences["frequency_penalty"],
            presence_penalty=preferences["presence_penalty"],
            top_p=preferences["top_p"],
            stream=False,
        )
        if response:
            full_response = response.choices[0].message.content

    except openai.RateLimitError as e:
        print("Rate limit reached. Sleeping for a minute...")
        print(e)
        sleep(10)
    except Exception as e:
        print(f"An error occurred: {e}")

    print("\n")
    return full_response