#!/bin/bash
set -e

sudo service postgresql start

sudo -u postgres psql -c "ALTER USER postgres WITH PASSWORD 'postgres';"
sudo -u postgres psql -c "SELECT 1 FROM pg_database WHERE datname='theroadproblem'" | grep -q 1 || sudo -u postgres createdb theroadproblem

# Configure pg_hba.conf to allow md5/scram from localhost/Windows host
PG_HBA=$(sudo -u postgres psql -t -P format=unaligned -c "SHOW hba_file;")
PG_CONF=$(sudo -u postgres psql -t -P format=unaligned -c "SHOW config_file;")

sudo sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" "$PG_CONF"
echo "host all all 0.0.0.0/0 md5" | sudo tee -a "$PG_HBA" > /dev/null
echo "host all all ::0/0 md5" | sudo tee -a "$PG_HBA" > /dev/null

sudo service postgresql restart

sudo -u postgres psql -d theroadproblem -c "CREATE EXTENSION IF NOT EXISTS postgis;"
sudo -u postgres psql -d theroadproblem -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;"
sudo -u postgres psql -d theroadproblem -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;"
sudo -u postgres psql -d theroadproblem -c "SELECT PostGIS_Version();"

echo "PostgreSQL setup complete!"
