FROM nginx:alpine

# Copy only the static runtime assets into Nginx's default web root
COPY index.html /usr/share/nginx/html/
COPY app.js /usr/share/nginx/html/
COPY config.js /usr/share/nginx/html/
COPY style.css /usr/share/nginx/html/
COPY timer-theme.css /usr/share/nginx/html/
COPY favicon.svg /usr/share/nginx/html/

# Use default CMD from nginx:alpine (starts nginx in foreground)
