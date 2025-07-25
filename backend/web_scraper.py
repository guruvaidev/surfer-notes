import requests
from logger import logger
from bs4 import BeautifulSoup
import re
from typing import Union

class WebScraper:
    def __init__(self):
        pass

    def html_document_loader(self, url: Union[str, bytes]) -> str:
        """
        Loads the HTML content of a document from a given URL and return it's content.

        Args:
            url: The URL of the document.

        Returns:
            The content of the document.

        Raises:
            Exception: If there is an error while making the HTTP request.

        """
        try:
            response = requests.get(url)
            html_content = response.text
            logger.info(f"Successfully fetched {url}")
        except Exception as e:
            print(f"Failed to load {url} due to exception {e}")
            logger.error(f"Failed to load {url} due to: {e}")
            return ""

        try:
            # Create a Beautiful Soup object to parse html
            soup = BeautifulSoup(html_content, "html.parser")

            # Remove script and style tags
            for script in soup(["script", "style"]):
                script.extract()

            # Get the plain text from the HTML document
            text = soup.get_text()

            # Remove excess whitespace and newlines
            text = re.sub("\s+", " ", text).strip()
            logger.info(f"Extracted text from {url} ({len(text)} characters)")
            return text
        except Exception as e:
            logger.error(f"Error parsing {url}: {e}")
            print(f"Exception {e} while loading document")
            return ""