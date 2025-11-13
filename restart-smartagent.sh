#!/bin/bash
# restart-smartagent.sh

docker compose down
sudo killall Docker
open /Applications/Docker.app

echo "Waiting for Docker to start..."
while ! docker info > /dev/null 2>&1; do
  sleep 2
done
echo "Docker is up!"

npm run build
docker build -t smartagent .
docker compose up --build
