from typing import List
from fastapi import FastAPI
import uvicorn
from pydantic import BaseModel
import numpy as np
from concurrent.futures import ThreadPoolExecutor
from web_scraper import WebScraper
from logger import logger
from text_processor import TextProcessor
from embedding_manager import EmbeddingManager
from llm_client import LLMClient
from fastapi.middleware.cors import CORSMiddleware
import json
from fastapi.responses import JSONResponse
from langchain.docstore.document import Document
from langchain.text_splitter import RecursiveCharacterTextSplitter
from fastapi import FastAPI, HTTPException

# nltk.download('punkt')
# nltk.download('stopwords')
# nltk.download('punkt_tab')

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
web_topic_keywords = []
doc_index_mapping = {}
global_index_counter = 0
notes_index_mapping = {}
note_counter = 0

class FileContent(BaseModel):
    content: str 
    notes: str

class UrlContent(BaseModel):
    content: str 

class FileQuery(BaseModel):
    query: str 

class URLRequest(BaseModel):
    urls: List[str]

class URLData(BaseModel):
    urls: List[str] 

def main():

    llm_client = LLMClient()
    web_Scrapper = WebScraper()
    text_processor = TextProcessor()
    embedding_manager = EmbeddingManager()

    def generate_important_note_data(combined_content):
        MAX_CONTENT_SIZE = 7000
        #combined_content = " ".join(doc.page_content for doc in docs)
        if not combined_content.strip():
            return "No content available to generate notes."

        chunks = [combined_content[i:i + MAX_CONTENT_SIZE] for i in range(0, len(combined_content), MAX_CONTENT_SIZE)]
        print(f"Generated {len(chunks)} chunks for note processing")

        def extract_key_points(chunk: str, chunk_idx: int) -> str:
            prompt = f"""
            You are an AI assistant. Read the following text and extract the most important points for a user note.
            Focus on key facts, ideas, or actionable insights. Summarize in 3-4 clear, concise sentences.
            Text: {chunk}
            Important Points:
            """
            messages = [{"role": "system", "content": prompt}]
            result = llm_client.generate_groq_llm_response(messages)
            print(f"Extracted key points from chunk {chunk_idx + 1}: {result}")
            return result or f"Chunk {chunk_idx + 1}: No key points extracted."

        with ThreadPoolExecutor() as executor:
            key_points_list = list(executor.map(lambda x: extract_key_points(*x), [(chunk, idx) for idx, chunk in enumerate(chunks)]))
        combined_key_points = "\n\n".join(filter(None, key_points_list))
        return combined_key_points

    @app.get("/") 
    def home():
        return {"message": "FastAPI server is running!"}

    @app.post("/api/send-url")
    async def receive_urls(data: URLData):
        print("Received URLs:", data.urls)
        return {"message": "URLs received", "urls": data.urls}
    
    @app.post("/extract_current")
    def extract_text(request: URLRequest):
        """API endpoint to extract text from a webpage."""
        global web_topic_keywords
        documents=[]
        print('request.urls',request.urls)
        for url in request.urls:
            text = web_Scrapper.html_document_loader(url)
            processed_text = text_processor.preprocess_text(text)

            try:
                keywords = text_processor.kw_model.extract_keywords(
                    processed_text,
                    keyphrase_ngram_range=(1, 2), 
                    stop_words='english',
                    top_n=5 
                )
                topic_keywords = [keyword[0] for keyword in keywords]
                print("Main Topic Keywords:", topic_keywords)
            except Exception as e:
                print(f"Error: {e}")
                print("Input text may be too short or empty after preprocessing. Please provide more text.")

            document_data = {
                "page_content": text,
                "metadata": {"source": url}
            }
            documents.append(document_data)
        web_topic_keywords.append(topic_keywords)
        print('web_topic_keywords',web_topic_keywords)
        
        return JSONResponse(content={"documents": documents,"Summary": topic_keywords})
    
    @app.post("/extract")
    def extract_text(request: URLRequest):
        """API endpoint to extract text from a webpage."""

        documents=[]
        for url in request.urls:
            text = web_Scrapper.html_document_loader(url)
            document_data = {
                "page_content": text,
                "metadata": {"source": url}
            }
            
            documents.append(document_data)
        return JSONResponse(content={"documents": documents})

    @app.post("/api/receive-file")
    async def receive_file(file_data: FileContent):
        global doc_index_mapping, global_index_counter
        global notes_index_mapping,note_counter
        global web_topic_keywords
        
        try:
            content = file_data.content
            filter_notes_ = file_data.notes
            print("filter_notes_",filter_notes_)
            print('content',content)
            dict_data = json.loads(content)
            if filter_notes_ !="no filter": 
                filter_notes = json.loads(filter_notes_)
            content_docs=[]
            note_flag=0
            if dict_data and "id" in dict_data[0]:
                for i in dict_data:
                    note_flag=1
                    content_docs.append({"page_content":i['content'],"metadata":{"keywords":i['keywords'],"url":i['url']}})  # Access stored documents
            else:        
                
                for i in dict_data:
                    content_docs.append(i['documents'][0])  # Access stored documents
            print(content_docs)
            documents = [Document(page_content=doc["page_content"], metadata=doc["metadata"]) for doc in content_docs]
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
            split_docs = text_splitter.split_documents(documents)
            document_embeddings = []
            document_metadata = []
            indexed_docs = []  # Store documents with their assigned index

            for idx, doc in enumerate(split_docs):  # Loop through split_docs instead of content_docs
                embedding = embedding_manager.embedding_model.embed_documents([doc.page_content])[0]  # Generate embedding
                document_embeddings.append(embedding)
                document_metadata.append(doc.metadata)
                indexed_docs.append(doc)

            if note_flag==1:
                embedding_manager.index_note.add_items(np.array(document_embeddings))
                for i, doc in enumerate(indexed_docs):
                    notes_index_mapping[note_counter + i] = doc
                note_counter += len(indexed_docs)
                
                print('notes_index_mapping',notes_index_mapping)
                
                return {"note_data": "note loaded"}    
            
            embedding_manager.index.add_items(np.array(document_embeddings))
            print('doc_index_mapping',doc_index_mapping)        
            
            for i, doc in enumerate(indexed_docs):
                doc_index_mapping[global_index_counter + i] = doc
            global_index_counter += len(indexed_docs)
            print(global_index_counter,'doc_index_mapping',doc_index_mapping)
            combined_text = " ".join(doc["content"] for doc in filter_notes)

            
            prompt = (
            f"You are an AI assistant. Read the following relevent history carefully and generate useful suggestions based on it.\n\n"
            f"Content:\n{combined_text}\n\n"
            f"Instructions:\n"
            f"- Tell that user stored this content.\n"
            f"- Provide 3 to 5 actionable suggestions.\n"
            f"- Use simple and clear language.\n"
            f"- Write suggestions as bullet points.\n"
            f"- In case no relevent history provided inform user that no past  relevent history and for ask user to help with notes taking.\n"
            )

            messages = [
                {"role": "system", "content": prompt}
            ]

            note = llm_client.generate_groq_llm_response(messages)
            print("by sys",note)
            
            return {"note_data": note}

        except json.JSONDecodeError:
                raise HTTPException(status_code=400, detail="Invalid JSON format")
    
    
    @app.post("/api/receive-url-file")
    async def receive_file(file_data: UrlContent):
        global doc_index_mapping, global_index_counter
        try:
            content = file_data.content
            print('content',content)
            dict_data = json.loads(content)
            content_docs=[]
            for i in dict_data:
                content_docs.append(i['documents'][0])  # Access stored documents

            print(content_docs)
            

            documents = [Document(page_content=doc["page_content"], metadata=doc["metadata"]) for doc in content_docs]
            text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
            split_docs = text_splitter.split_documents(documents)

            document_embeddings = []
            document_metadata = []
            indexed_docs = []  # Store documents with their assigned index

            for idx, doc in enumerate(split_docs):  # Loop through split_docs instead of content_docs
                embedding = embedding_manager.embedding_model.embed_documents([doc.page_content])[0]  # Generate embedding
                document_embeddings.append(embedding)
                document_metadata.append(doc.metadata)
                indexed_docs.append(doc)
            embedding_manager.index.add_items(np.array(document_embeddings))
        
            print('doc_index_mapping',doc_index_mapping)
            for i, doc in enumerate(indexed_docs):
                doc_index_mapping[global_index_counter + i] = doc

            global_index_counter += len(indexed_docs)
            #doc_index_mapping = {i: indexed_docs[i] for i in range(len(indexed_docs))}
            
            print('doc_index_mapping',doc_index_mapping)

            combined_content_text = " ".join(doc.page_content for doc in documents)

            important_note_data = generate_important_note_data(combined_content_text)
            return {"note_data": important_note_data}

        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid JSON format")
        except Exception as e:
            logger.error(f"Error processing file: {e}")
            raise HTTPException(status_code=500, detail="Internal server error")
        
    @app.post("/api/receive-query")
    async def receive_file(file_query: FileQuery):
        query=file_query.query
        print('query_test',doc_index_mapping,query)

        relevant_docs = embedding_manager.retrieve_documents(query, embedding_manager.index, doc_index_mapping, top_k=3)
      
        context = " ".join([doc["text"] for doc in relevant_docs])
        note = generate_important_note_data(context)
        
        print('context',context)
        # Get the answer using the QA model
        answer = llm_client.qa_prompt(query, context)
      
        print(answer)
        
        
        return {
            "answer": answer,
            "note": note
        }
    
    uvicorn.run(app, host="127.0.0.1", port=8000)

if __name__ == "__main__":
    main()
    