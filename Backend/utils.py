import logging
import asyncio
import uuid
import sys
from datetime import datetime

class WebSocketLogHandler(logging.Handler):
    def __init__(self, ws_manager=None):
        super().__init__()
        self.ws_manager = ws_manager
        print(f"Initializing WebSocketLogHandler with ws_manager: {ws_manager}", file=sys.stderr)

    def set_ws_manager(self, ws_manager):
        self.ws_manager = ws_manager
        print(f"Updated ws_manager in WebSocketLogHandler: {ws_manager}", file=sys.stderr)

    def normalize_agent_name(self, logger_name):
        """Map logger names to LiveConsole agent names."""
        name_map = {
            "FORWARDER": "LogForwarder",
            "MONITOR": "MonitorAgent",
            "ErrorAnalyzer": "ErrorAnalyzer",
            "FixerAgent": "FixerAgent"
        }
        return name_map.get(logger_name, logger_name)

    async def async_emit(self, record):
        if not self.ws_manager:
            if record.name != "FORWARDER":
                print(f"No ws_manager set, skipping broadcast for log: {record.msg}", file=sys.stderr)
            return
        # Only broadcast logs from FORWARDER to avoid duplicating action messages
        if record.name != "FORWARDER":
            return
        try:
            log_entry = {
                "id": str(uuid.uuid4()),
                "timestamp": datetime.now().strftime("%H:%M:%S"),
                "level": record.levelname,
                "agent": self.normalize_agent_name(record.name),
                "message": self.format(record),
                "source": getattr(record, 'source', None) or "Unknown"
            }
            # Suppress broadcast debug prints for FORWARDER (LogForwarder)
            if record.name != "FORWARDER":
                print(f"Preparing to broadcast: {log_entry}", file=sys.stderr)
            await self.ws_manager.broadcast(log_entry)
            if record.name != "FORWARDER":
                print(f"Successfully broadcasted: {log_entry}", file=sys.stderr)
        except Exception as e:
            if record.name != "FORWARDER":
                print(f"Error broadcasting log: {e}", file=sys.stderr)

    def emit(self, record):
        # Suppress "Emitting log" for FORWARDER (LogForwarder)
        if record.name != "FORWARDER":
            print(f"Emitting log: {record.msg}", file=sys.stderr)
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                loop.create_task(self.async_emit(record))
            else:
                loop.run_until_complete(self.async_emit(record))
        except RuntimeError as e:
            if record.name != "FORWARDER":
                print(f"Event loop error in emit: {e}", file=sys.stderr)

def setup_logging(ws_manager=None):
    """Configure global logging with WebSocketLogHandler."""
    handlers = [
        logging.FileHandler("C:/Users/Quadrant/Loganalytics/Backend/windows_errors.log"),
        logging.StreamHandler(),
        WebSocketLogHandler(ws_manager)
    ]
    log_format = logging.Formatter(
        fmt='%(asctime)s [%(name)s] [%(levelname)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    for handler in handlers:
        handler.setFormatter(log_format)
    logging.getLogger('').handlers = handlers  # Set handlers on root logger
    logging.getLogger('').setLevel(logging.INFO)
    print(f"Configured global logging with ws_manager: {ws_manager}", file=sys.stderr)