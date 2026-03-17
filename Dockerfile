FROM nginx:alpine

# Copy static site into Nginx's default web root
COPY . /usr/share/nginx/html

# Use default CMD from nginx:alpine (starts nginx in foreground)