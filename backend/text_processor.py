from keybert import KeyBERT
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize

class TextProcessor:
    def __init__(self):
        self.kw_model = KeyBERT(model='all-MiniLM-L6-v2')
    
    def preprocess_text(self, text):
        stop_words = set(stopwords.words('english'))
        tokens = word_tokenize(text.lower())
        tokens = [t for t in tokens if t.isalpha() and t not in stop_words and len(t) > 2]
        return " ".join(tokens)

    def get_topic_keywords(self, text):
        processed_text = self.preprocess_text(text)
        try:
            keywords = self.kw_model.extract_keywords(
                processed_text,
                keyphrase_ngram_range=(1, 2),  # Allow single words and bigrams
                stop_words='english',
                top_n=5  # Get top 5 keywords
            )
            topic_keywords = [keyword[0] for keyword in keywords]
            print("Main Topic Keywords:", topic_keywords)
        except Exception as e:
            print(f"Error: {e}")
            print("Input text may be too short or empty after preprocessing. Please provide more text.")
        return topic_keywords
