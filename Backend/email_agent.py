import asyncio
import json
import logging
import os
import uuid
from datetime import datetime
from autogen import AssistantAgent
from dotenv import load_dotenv
from filelock import FileLock
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import base64
from email.mime.text import MIMEText
import ssl
import http.client
import time
import re

load_dotenv()

class EmailAgent(AssistantAgent):
    def __init__(self, name, llm_config, analyzer_agent=None, ws_manager=None):
        super().__init__(name=name, llm_config=llm_config)
        self.logger = logging.getLogger("EMAIL_AGENT")
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            handlers=[
                logging.FileHandler("C:/Users/Quadrant/Loganalytics/Backend/email_agent.log"),
                logging.StreamHandler()
            ]
        )
        self.analyzer_agent = analyzer_agent
        self.ws_manager = ws_manager
        self.email_address = os.getenv("EMAIL_ADDRESS")
        self.human_email = os.getenv("HUMAN_EMAIL")
        self.email_requests_file = "C:/Users/Quadrant/Loganalytics/Backend/email_requests.json"
        self.email_requests_lock = FileLock(self.email_requests_file + ".lock")
        self.pending_requests = self.load_pending_requests()
        self.credentials = self.load_credentials()
        # Create custom HTTPS connection with modern TLS
        self.ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        self.ssl_context.minimum_version = ssl.TLSVersion.TLSv1_2
        self.ssl_context.verify_mode = ssl.CERT_REQUIRED
        self.ssl_context.load_default_certs()
        self.service = build('gmail', 'v1', credentials=self.credentials, discoveryServiceUrl=None, static_discovery=False)

    def load_credentials(self):
        """Load or generate Gmail API credentials."""
        creds = None
        token_path = 'C:/Users/Quadrant/Loganalytics/Backend/token.json'
        creds_path = 'C:/Users/Quadrant/Loganalytics/Backend/credentials.json'
        scopes = [
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.modify'
        ]

        try:
            if os.path.exists(token_path):
                creds = Credentials.from_authorized_user_file(token_path, scopes)
            if not creds or not creds.valid:
                if creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                else:
                    flow = InstalledAppFlow.from_client_secrets_file(creds_path, scopes)
                    creds = flow.run_local_server(port=0)
                with open(token_path, 'w', encoding='utf-8') as token_file:
                    token_file.write(creds.to_json())
            return creds
        except Exception as e:
            self.logger.error(f"Failed to load Gmail credentials: {e}")
            raise

    def load_pending_requests(self):
        """Load pending email requests from file with file locking."""
        try:
            with self.email_requests_lock:
                if not os.path.exists(self.email_requests_file):
                    self.logger.info(f"email_requests.json does not exist, creating empty file")
                    with open(self.email_requests_file, 'w', encoding='utf-8') as f:
                        json.dump({}, f)
                    return {}
                with open(self.email_requests_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except json.JSONDecodeError as e:
            with self.email_requests_lock:
                with open(self.email_requests_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                self.logger.error(f"Failed to parse email_requests.json: {e}. File content: {content[:100] or 'Empty'}")
                with open(self.email_requests_file, 'w', encoding='utf-8') as f:
                    json.dump({}, f)
                return {}
        except Exception as e:
            self.logger.error(f"Failed to load pending requests from {self.email_requests_file}: {e}")
            return {}

    def save_pending_requests(self):
        """Save pending email requests to file with file locking."""
        try:
            with self.email_requests_lock:
                with open(self.email_requests_file, 'w', encoding='utf-8') as f:
                    json.dump(self.pending_requests, f, indent=4)
        except Exception as e:
            self.logger.error(f"Failed to save pending requests to {self.email_requests_file}: {e}")

    def create_message(self, to, subject, message_text):
        """Create a message for an email."""
        message = MIMEText(message_text)
        message['to'] = to
        message['from'] = self.email_address
        message['subject'] = subject
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
        return {'raw': raw}

    async def send_email(self, error_message, reference, source):
        """Draft and send email to human for approval with retry."""
        max_retries = 3
        retry_delay = 2
        for attempt in range(max_retries):
            try:
                subject = f"Error Detected - Approval Required (Ref: {reference})"
                error_summary = error_message.split('\nReference:')[0].strip()
                body = (
                    f"Dear User,\n\n"
                    f"We have detected an error from the {source} source:\n\n"
                    f"{error_summary}\n\n"
                    f"At a high level, we propose to analyze and fix this error. Please reply with 'Approve' to proceed with the analysis and remediation, or 'Decline' to halt further actions.\n\n"
                    f"Reference ID: {reference}\n\n"
                    f"Best regards,\n"
                    f"Log Analytics System"
                )
                message = self.create_message(self.human_email, subject, body)
                result = self.service.users().messages().send(userId='me', body=message).execute()
                # Fetch the sent email to get the correct Message-ID header
                sent_message = self.service.users().messages().get(
                    userId='me',
                    id=result['id'],
                    format='metadata',
                    metadataHeaders=['Message-ID']
                ).execute()
                headers = sent_message.get('payload', {}).get('headers', [])
                message_id = None
                for header in headers:
                    if header['name'].lower() == 'message-id':
                        message_id = header['value'].strip('<>')
                        break
                if not message_id:
                    self.logger.error(f"No Message-ID header found for sent email (reference: {reference}, Gmail ID: {result['id']})")
                    message_id = result['id']  # Fallback to Gmail ID
                self.logger.info(f"Email sent successfully for reference: {reference} with Message-ID: {message_id}")
                self.pending_requests[reference] = {
                    "error_message": error_message,
                    "source": source,
                    "message_id": message_id,
                    "timestamp": datetime.now().isoformat()
                }
                self.save_pending_requests()
                await self.broadcast_message(
                    agent="EmailAgent",
                    status="email sent",
                    timestamp=datetime.now().strftime("%H:%M:%S"),
                    details=f"Email sent to {self.human_email} for approval (Ref: {reference}, Message-ID: {message_id})",
                    reference=reference
                )
                return True
            except HttpError as e:
                self.logger.error(f"HttpError sending email for reference {reference} (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))
                else:
                    return False
            except Exception as e:
                self.logger.error(f"Error sending email for reference {reference} (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    await asyncio.sleep(retry_delay * (2 ** attempt))
                else:
                    return False

    async def check_inbox(self):
        """Poll inbox for replies every 5 seconds with retry."""
        max_retries = 3
        retry_delay = 2
        while True:
            try:
                self.logger.info("Polling Gmail inbox for new unread emails...")
                result = self.service.users().messages().list(
                    userId='me',
                    labelIds=['INBOX'],
                    q=f'is:unread from:{self.human_email}',
                    maxResults=10
                ).execute()
                messages = result.get('messages', [])
                if not messages:
                    self.logger.debug("No new unread emails found from human")
                else:
                    self.logger.info(f"Found {len(messages)} unread email(s) from {self.human_email}")
                for message in messages:
                    await self.process_reply(message)
                    # Mark as read after processing
                    self.service.users().messages().modify(
                        userId='me',
                        id=message['id'],
                        body={'removeLabelIds': ['UNREAD']}
                    ).execute()
                    self.logger.info(f"Marked email {message['id']} as read")
                await asyncio.sleep(5)
            except HttpError as e:
                self.logger.error(f"Failed to fetch inbox messages: {e}")
                await asyncio.sleep(5)
            except Exception as e:
                self.logger.error(f"Error checking inbox: {e}")
                await asyncio.sleep(5)

    async def process_reply(self, message):
        """Process an email reply to determine intent."""
        try:
            msg_id = message['id']
            self.logger.info(f"Processing email ID: {msg_id}")
            full_message = await asyncio.get_event_loop().run_in_executor(
                None, lambda: self.service.users().messages().get(userId='me', id=msg_id, format='full').execute()
            )
            headers = full_message.get('payload', {}).get('headers', [])
            in_reply_to = None
            message_id = None
            
            # Extract In-Reply-To and Message-ID headers
            for header in headers:
                if header['name'].lower() == 'in-reply-to':
                    in_reply_to = header['value'].strip('<>')
                    self.logger.debug(f"Found In-Reply-To header: {in_reply_to}")
                if header['name'].lower() == 'message-id':
                    message_id = header['value'].strip('<>')
                    self.logger.debug(f"Found Message-ID header: {message_id}")
            
            if not in_reply_to:
                self.logger.warning(f"No In-Reply-To header found in email {msg_id}. Cannot match to pending request.")
                return
            
            # Log all pending requests for debugging
            self.logger.debug(f"Current pending requests: {json.dumps(self.pending_requests, indent=2)}")
            
            # Find matching pending request
            for reference, request in list(self.pending_requests.items()):
                stored_message_id = request.get('message_id')
                if not stored_message_id:
                    self.logger.warning(f"No message_id found for pending request {reference}. Skipping.")
                    continue
                # Normalize both IDs for comparison
                normalized_stored_id = stored_message_id.strip('<>')
                normalized_in_reply_to = in_reply_to.strip('<>')
                if normalized_stored_id == normalized_in_reply_to:
                    self.logger.info(f"Found matching reply for reference {reference} (stored message_id: {stored_message_id}, in_reply_to: {in_reply_to})")
                    # Broadcast email received message
                    await self.broadcast_message(
                        agent="EmailAgent",
                        status="email received",
                        timestamp=datetime.now().strftime("%H:%M:%S"),
                        details=f"Received reply email for reference {reference} (Message-ID: {message_id})",
                        reference=reference
                    )
                    await self.analyze_reply(full_message, reference, request)
                    return  # Process only one matching reply per email
            
            self.logger.warning(f"No matching pending request found for email {msg_id} with In-Reply-To: {in_reply_to}. Stored message IDs: {[req['message_id'] for req in self.pending_requests.values()]}")
        except HttpError as e:
            self.logger.error(f"HttpError processing reply {msg_id}: {e}")
        except Exception as e:
            self.logger.error(f"Error processing reply {msg_id}: {e}", exc_info=True)

    async def analyze_reply(self, message, reference, request):
        """Analyze reply to determine intent and proceed."""
        try:
            self.logger.info(f"Analyzing reply for reference {reference}")
            # Extract body
            body = ''
            if 'parts' in message['payload']:
                for part in message['payload']['parts']:
                    if part['mimeType'] == 'text/plain':
                        body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                        break
                    elif part['mimeType'] == 'text/html':
                        html_body = base64.urlsafe_b64decode(part['body']['data']).decode('utf-8')
                        # Simple HTML to text conversion (remove tags)
                        body = re.sub(r'<[^>]+>', '', html_body)
            else:
                body = base64.urlsafe_b64decode(message['payload']['body']['data']).decode('utf-8')
            
            subject = next((header['value'] for header in message['payload']['headers'] if header['name'].lower() == 'subject'), '')
            self.logger.debug(f"Email body: {body[:100]}... Subject: {subject}")
            
            # Simple intent analysis
            intent = "Request_declined"
            if any(word in body.lower() for word in ["approve", "yes", "proceed", "go ahead", "ok"]):
                intent = "Request_approved"
            elif any(word in body.lower() for word in ["decline", "no", "reject", "stop"]):
                intent = "Request_declined"
            
            await self.broadcast_message(
                agent="EmailAgent",
                status="intent analyzed",
                timestamp=datetime.now().strftime("%H:%M:%S"),
                details=f"Intent analyzed for reference {reference}: {intent} (body: {body[:50]}...)",
                reference=reference
            )
            
            if intent == "Request_approved":
                if request['source'] == "windows":
                    # Write to windows_errors.log for approved Windows errors
                    with open("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log", "a", encoding="utf-8") as f:
                        f.write(f"[{datetime.now()}] {request['error_message']}\n{'-' * 60}\n")
                    self.logger.info(f"Logged approved Windows error to windows_errors.log for reference {reference}")
                
                if self.analyzer_agent:
                    self.analyzer_agent.logger.info(f"AnalyzerAgent triggered for approved error (Ref: {reference})")
                    analysis_result = await self.analyzer_agent.analyze_error(
                        request['error_message'],
                        source=request['source']
                    )
                    analysis_timestamp = datetime.now().strftime("%H:%M:%S")
                    analysis_details = f"Root cause identified: {analysis_result.get('root_cause', 'Unknown')}"
                    await self.broadcast_message(
                        agent="ErrorAnalyzer",
                        status="analysis complete",
                        timestamp=analysis_timestamp,
                        details=analysis_details,
                        reference=reference
                    )
                    output = {
                        "reference": reference,
                        "error": request['error_message'],
                        "root_cause": analysis_result.get('root_cause', 'Unknown'),
                        "remediation_steps": analysis_result.get('remediation_steps', []),
                        "source": request['source']
                    }
                    if request['source'] == "kubernetes":
                        output["manifest_file"] = analysis_result.get("manifest_file", None)
                    with open(f"C:/Users/Quadrant/Loganalytics/Backend/fix_queue.json", 'w', encoding='utf-8') as out:
                        json.dump(output, out, indent=4)
                    self.analyzer_agent.logger.info(f"Analysis result written to fix_queue.json for reference {reference}")
            else:
                self.logger.info(f"Error processing halted for reference {reference} due to {intent}")
            
            # Remove processed request
            del self.pending_requests[reference]
            self.save_pending_requests()
        except Exception as e:
            self.logger.error(f"Error analyzing reply for reference {reference}: {e}")

    async def broadcast_message(self, agent, status, timestamp, details, reference):
        """Broadcast message to WebSocket and log."""
        message = {
            "agent": agent,
            "status": status,
            "time": timestamp,
            "details": details,
            "reference": reference
        }
        self.logger.info(f"Broadcasting message: {json.dumps(message)}")
        if self.ws_manager:
            await self.ws_manager.broadcast(message)

    async def handle_error(self, error_message, source, reference):
        """Handle error received from MonitorAgent."""
        try:
            success = await self.send_email(error_message, reference, source)
            if success:
                self.logger.info(f"Error handled and email sent for reference {reference}")
            else:
                self.logger.error(f"Failed to handle error for reference {reference}")
        except Exception as e:
            self.logger.error(f"Error handling error for reference {reference}: {e}")

    async def run_async(self):
        """Run the email agent, monitoring inbox."""
        self.logger.info("Starting EmailAgent inbox monitoring...")
        try:
            await self.check_inbox()
        except asyncio.CancelledError:
            self.logger.info("EmailAgent stopped by user")
        except Exception as e:
            self.logger.error(f"Error in EmailAgent loop: {e}")

    def run(self):
        """Synchronous wrapper for running the async email agent."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(self.run_async())
        finally:
            loop.close()

if __name__ == "__main__":
    from agent import ErrorAnalyzerAgent
    llm_config = {"model": "gpt-4o", "api_key": os.getenv("OPEN_API_KEY")}
    analyzer_agent = ErrorAnalyzerAgent(name="ErrorAnalyzerAgent", llm_config=llm_config)
    email_agent = EmailAgent(name="EmailAgent", llm_config=llm_config, analyzer_agent=analyzer_agent)
    email_agent.run()