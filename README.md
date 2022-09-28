# Viewing Pointclouds made easy.

## 
This project was created during the IT-Project course at JKU by Feyza Bozkaya, Paul Feichtenschlager, Josef Niedereder and Alexander Wolf.

## Setting up your own PointCloudViewer instance
This project relies on the AWS S3 service and its SDK, therefore an AWS account is required. In our own deployment we used AWS EC2 and RDS aswell but you can use other services aswell.

After cloning the project on your own server, create a .env file with the following information:
(Note: for the install script to work there need to no spaces before and after the equal signs and a new line at the end of the file)
```
COOKIE_SECRET=secret string used for cookie creation
HOST=host.ip.of.your.database.instance
DATABASE_USER=name of your database user
PASSWORD=password for your database user
PORT=Database port to be used (probably 3306)
AWS_ACCESS_KEY_ID=access key id used for pushing point clouds to S3
AWS_SECRET_ACCESS_KEY=secret access key used for pushing point clouds to S3
```
After creating the file run the install.sh script.