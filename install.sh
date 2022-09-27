#!/bin/bash
sudo apt-get update
sudo apt-get upgrade

cd "$(dirname "$0")"

git clone https://github.com/potree/PotreeConverter.git
sudo apt-get install mysql-client

HOST
USER
PASSWORD
PORT
file='.env'
read_from_env() {
    while read line; do
        curr_var=${line%=*}
        if [ "$curr_var" = "HOST" ]; then
            HOST=${line#*=}
        elif [ "$curr_var" = "DATABASE_USER" ]; then
            DATABASE_USER=${line#*=}
        elif [ "$curr_var" = "PASSWORD" ]; then
            PASSWORD=${line#*=}
        elif [ "$curr_var" = "PORT" ]; then
            PORT=${line#*=}
        fi
    done <$file
}

read_from_env

mysql -h $HOST -u $DATABASE_USER -p$PASSWORD -P $PORT pointcloudDB <resources/create_tables.sql

sudo apt-get install npm
npm i
npm i pm2 -g
sudo apt-get install nginx
sudo touch /etc/nginx/conf.d/pointcloudviewer.conf
cat ~/PointCloudViewer/resources/nginx_conf.txt > /etc/nginx/conf.d/pointcloudviewer.conf
sudo rm /etc/nginx/sites-enabled/default
sudo systemctl start nginx

sudo apt install cmake
sudo apt install libtbb-dev
cd PotreeConverter
mkdir build
cd build
cmake ../
make

pm2 start ~/PointCloudViewer/app.js
