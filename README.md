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
BASE_URL=The base URL of your project (depending on if in deployment or not)
S3_BUCKET_BASE_URL=The base URL for the S3 Bucket the point clouds are hosted on
```
After creating the file run the install.sh script.

# User Manual

## Main Page
On the main page, a user who is not logged in sees only a table "Public Clouds" with the links to the 3D point clouds. 

![main page1](/images_user_manual/main_page_public_clouds.png)

In order to uploud own your own files or view the uploaded files, the user (if not already registered, must create an account) must log in. 

![main page2](/images_user_manual/main_page_both_tables.png)

It is also possible to search for desired point clouds in the respective tables or delete the file that are not needed. 

![main page3](/images_user_manual/search_and_delete.png)

## Create new user
The user can create a new account by filling in the two text fields "Username" and "Password" and then clicking the Submit button. 

![create new user](/images_user_manual/create_new_user.png)

## Login
Users can log in by providing their username and password that they entered during registration and clicking "Submit".

![login](/images_user_manual/login.png)

## Upload Point Cloud
On this page, users can uploud their LAS file, which should be illustrated. The file can be selected by cklicking the button "Datei auswählen". (If desited, after selecting the file name can be changed.) With a click on "Submit" the file will be uploaded and converted. 

![upload1](/images_user_manual/choose_file.png)
    
The progress of this operations is illustrated with the bars. It is possible to cancel or pause an upload by clicking of the particular button.

![upload2](/images_user_manual/balken.gif)
    
After the conversion is completed, the user gets the following message "Process now completed. You can view your pointcloud here".

![upload3](/images_user_manual/upload_comleted.png)

With a click on "here" the user will be redirected to the uploaded point cloud. 

![upload4](/images_user_manual/view_point_cloud.png)

