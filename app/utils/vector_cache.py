import pickle
import numpy as np
from app.models.embedding_models import Document, DocumentChunk, DocumentEmbedding


def deserialize_embedding(embedding_bytes):
    try:
        embedding_array = pickle.loads(embedding_bytes)
    except Exception as e:
        raise ValueError("Failed to deserialize embedding: {}".format(e))
    if embedding_array.dtype != np.float32:
        raise ValueError("Unexpected embedding array dtype: {}".format(embedding_array.dtype))
    if embedding_array.shape != (3072,):
        raise ValueError("Unexpected embedding array shape: {}".format(embedding_array.shape))

    return embedding_array


class VectorCache:
    _instance = None
    _vectors = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(VectorCache, cls).__new__(cls)
        return cls._instance

    @classmethod
    def clear_cache(cls):
        cls._vectors.clear()

    @classmethod
    def load_user_vectors(cls, user_id):
        cls.clear_cache()
        embeddings = (
            DocumentEmbedding.query.join(DocumentChunk, DocumentChunk.id == DocumentEmbedding.chunk_id)
            .join(Document, Document.id == DocumentChunk.document_id)
            .filter(DocumentEmbedding.user_id == user_id, Document.delete == False)
            .all()
        )

        vector_data = {}

        for embedding in embeddings:
            vector = np.frombuffer(embedding.embedding, dtype=np.float32)
            vector_data[str(embedding.chunk_id)] = vector

        cls._vectors.update(vector_data)

    @classmethod
    def mips_naive(cls, query_vector, subset_ids):
        if not isinstance(query_vector, np.ndarray):
            raise ValueError("Query vector must be a numpy array.")

        if query_vector.ndim != 1:
            raise ValueError("Query vector must be a 1D array.")

        similarities = []
        for id in subset_ids:
            if id in cls._vectors:
                similarity = np.dot(query_vector, cls._vectors[id])
                similarities.append((id, similarity))

        # Sort by similarity score in descending order
        similarities.sort(key=lambda x: x[1], reverse=True)

        # Convert similarity scores to ranks
        ranked_similarities = [(id, rank + 1) for rank, (id, _) in enumerate(similarities)]

        return ranked_similarities
