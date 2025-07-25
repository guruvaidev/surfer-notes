import groq
import os

GROQ_API_KEY = os.environ.get("GROQ_API_KEY")

class LLMClient:
    def __init__(self):
        self.model_name = "llama3-8b-8192"
        self._api_key = GROQ_API_KEY

    def generate_groq_llm_response(self, messages):
        if not any(msg["content"].strip() for msg in messages):
            return "Error: Both question and context are empty. Please try again with a valid input."
        try:
            client = groq.Groq(api_key=self._api_key)
            completion = client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                temperature=1,
                max_tokens=1024,
                top_p=1,
                stream=True,
                stop=None,
            )
            response = ""
            for chunk in completion:
                if chunk.choices[0].delta.content is not None:
                    response += chunk.choices[0].delta.content
            print(f"LLM reponse is {response}")
            return response
        except Exception as e:
            print(f"Error during API request: {e}")
            print("An error occurred while processing your Groq LLM request. Please try again.")
        
    def qa_prompt(self, question, combined_docs):
        print('combined_docs',combined_docs)
        if not question.strip():
            return "Please provide a valid question."
        if not combined_docs:
            return "No context available to answer the question."
        # Combine all the documents into a single context
        retrieved_context = "\n".join(combined_docs)
        context = (f"you are the AI agent give the best answer in the simple words. Retrive answer from the Context\n\n{retrieved_context}\n\n")
        prompt = (
            f"Context: {context}\n\n"
            f"Provide concise answers to the question in 2 sentences or less for the user."     
        )            
        messages = [
            {"role": "user", "content": question},
            {"role": "system", "content": prompt}
            ]
        return self.generate_groq_llm_response(messages)
    

    def summary_prompt(self, combined_docs):
        print('combined_docs:', combined_docs)
        retrieved_context = "\n".join(combined_docs)
        max_chunk_size = 7000  # limit characters (safe for 8192 tokens)
        chunks = []
        for i in range(0, len(retrieved_context), max_chunk_size):
            chunk = retrieved_context[i:i + max_chunk_size]
            chunks.append(chunk)
        print(f"Total chunks created: {len(chunks)}")
        extracted_contexts = []
        for idx, chunk in enumerate(chunks):
            print(f"Extracting context from chunk {idx + 1}...")
            prompt = f"""
            You are a smart AI agent. Carefully read the following text and extract the main context.
            Focus only on the core topic and purpose. Write 3-4 clear sentences.
            Text: {chunk}
            Main Context:
            """
            messages = [
                {"role": "system", "content": prompt}
            ]
            extracted_text = self.generate_groq_llm_response(messages)
            if extracted_text is None:
                print(f"Warning: extraction for chunk {idx + 1} was None. Skipping.")
                continue
            extracted_contexts.append(extracted_text)
        if not extracted_contexts:
            return "No context could be extracted. Please check input."
        final_extracted_context = "\n".join(extracted_contexts)
        print("All chunks processed. Returning extracted context...")
        return final_extracted_context