#!/bin/bash
cd "$(dirname "$0")"
git clone https://github.com/potree/PotreeConverter.git
sudo apt-get update
sudo apt-get upgrade
sudo apt-get install mysql-client
sudo apt-get install npm
npm i
npm i pm2 -g
sudo apt-get install nginx
sudo apt install cmake
sudo apt install libtbb-dev
cd PotreeConverter
mkdir build
cd build
cmake ../
make
