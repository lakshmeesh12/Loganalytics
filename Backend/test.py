import requests
import time

DATABRICKS_HOST = "https://dbc-b5703667-6412.cloud.databricks.com"
DATABRICKS_TOKEN = ""

url = f"{DATABRICKS_HOST}/api/2.0/sql/history/queries"
headers = {
    "Authorization": f"Bearer {DATABRICKS_TOKEN}"
}

poll_interval = 10  # seconds

def get_query_error(query_id):
    error_url = f"{DATABRICKS_HOST}/api/2.0/sql/history/queries/{query_id}"
    response = requests.get(error_url, headers=headers)
    if response.status_code == 200:
        data = response.json()
        return data.get("error_message", "No error message available")
    else:
        return f"Failed to fetch query details: {response.text}"

# Initialize seen_query_ids with all queries that exist at script start
def get_existing_query_ids():
    response = requests.get(url, headers=headers, params={"max_results": 100})
    ids = set()
    if response.status_code == 200:
        data = response.json()
        for query in data.get("res", []):
            ids.add(query.get("query_id"))
    return ids

seen_query_ids = get_existing_query_ids()
print("Starting real-time query monitoring... (Press Ctrl+C to stop)")

try:
    while True:
        response = requests.get(url, headers=headers, params={"max_results": 20})
        if response.status_code == 200:
            data = response.json()
            for query in data.get("res", []):
                query_id = query.get("query_id")
                if query_id not in seen_query_ids:  # Only process new queries
                    status = query.get("status")
                    print(f"New Query Detected:")
                    print(f"  Query ID: {query_id}")
                    print(f"  Status: {status}")
                    print(f"  User: {query.get('user_name')}")
                    print(f"  Query Text: {query.get('query_text')}")
                    print(f"  Start Time: {query.get('start_time_ms')}")
                    print(f"  End Time: {query.get('end_time_ms')}")
                    if status == "FAILED":
                        error_message = get_query_error(query_id)
                        print(f"  Error Message: {error_message}")
                    print("-" * 40)
                    seen_query_ids.add(query_id)  # Add new query ID to seen list
        else:
            print(f"Failed to fetch query history. Status code: {response.status_code}")
            print(response.text)
        time.sleep(poll_interval)
except KeyboardInterrupt:
    print("Stopped real-time monitoring.")