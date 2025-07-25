from typing import List, Dict, Any
from langchain.docstore.document import Document
from langchain.embeddings import SentenceTransformerEmbeddings
import numpy as np
import hnswlib

class EmbeddingManager:
    def __init__(self):
        self.model_name = "all-MiniLM-L6-v2"
        self.embedding_model = SentenceTransformerEmbeddings(model_name=self.model_name)
        self.dimension = 384
        self.index = hnswlib.Index(space="cosine", dim=self.dimension)
        self.index.init_index(max_elements=10000, ef_construction=200, M=16)
        self.index.set_ef(100)
        self.index_note = hnswlib.Index(space="cosine", dim=self.dimension)
        self.index_note.init_index(max_elements=10000, ef_construction=200, M=16)
        self.index_note.set_ef(100)

    def get_embedding_model(self):
        return self.embedding_model
    
    def generate_embedding(self, text):
        """Generate embeddings using LangChain's SentenceTransformerEmbeddings"""
        return np.array(self.embedding_model.embed_documents([text])[0])

    def retrieve_documents(
            self,
            query: str,
            index: hnswlib.Index,
            docs_index_map: Dict[int, Document],
            top_k: int = 3
            ) -> List[Dict[str, Any]]:

        # Check if index is initialized and has data
        if index.get_current_count() == 0:
            return []
        try:
            query_embedding = self.embedding_model.embed_documents([query])[0]
            labels, distances = index.knn_query(query_embedding, k=top_k)
            relevant_docs = []
            for label, distance in zip(labels[0], distances[0]):
                if label in docs_index_map:
                    doc = docs_index_map[label]
                    relevant_docs.append({
                        "text": doc.page_content,
                        "metadata": doc.metadata,
                        "distance": float(distance)  # Convert to float for JSON serialization
                    })
                else:
                    print(f"Document with label {label} not found in docs_index_map")
            if not relevant_docs:
                ("No relevant documents found for query")
            else:
                print(f"Retrieved {len(relevant_docs)} relevant documents")
            return relevant_docs

        except Exception as e:
            print(f"Error retrieving documents: {e}")
            raise