#!/usr/bin/env python3
import psycopg2
import sys

# Database connection parameters
db_params = {
    'host': 'localhost',
    'port': 5433,
    'database': 'housekeeping',
    'user': 'housekeeping',
    'password': 'devpassword'
}

sql_file = '/Users/abraham/Downloads/seed_hotel_tulum_v3.sql'

try:
    # Read SQL file
    with open(sql_file, 'r') as f:
        sql_content = f.read()

    print('✓ SQL file read successfully')

    # Connect to database
    conn = psycopg2.connect(**db_params)
    cursor = conn.cursor()
    print('✓ Connected to database')

    # Execute SQL
    cursor.execute(sql_content)
    conn.commit()
    print('✓ Script executed successfully without errors')

    cursor.close()
    conn.close()

except psycopg2.Error as e:
    print(f'✗ Database error: {e}', file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f'✗ Error: {e}', file=sys.stderr)
    sys.exit(1)
