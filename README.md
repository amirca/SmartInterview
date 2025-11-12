


To use the delete_user_conversation.js script, run the following command in your project directory:

Replace <phoneNumber> with the user's phone number (digits only, e.g., 972512345678).
Example:

This will delete all conversation records for that phone number from Elasticsearch.




docker-compose down && docker-compose up --build



Ngrok
-----

brew install ngrok/ngrok/ngrok
ngrok http 3111

https://dashboard.ngrok.com/get-started/setup/macos


curl -X POST https://1566419e6b92.ngrok-free.app/webhook -H "Content-Type: application/json" -d '{"firstName": "אמיר", "lastName": "קפואנו", "phoneNumber": "972537294438"}'

curl -X POST https://1566419e6b92.ngrok-free.app/schedule-interview-webhook -H "Content-Type: application/json" -d '{"firstName": "אמיר", "lastName": "קפואנו", "phoneNumber": "972537294438"}'