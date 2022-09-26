create table user_table (
	id int NOT NULL auto_increment,
    user_name varchar(255) unique,
    password_hash varchar(255) not null,
    primary key (id)
);

create table cloud_table (
	id int NOT NULL AUTO_INCREMENT,
    cloud_name varchar(255) unique,
    link varchar(255) not null,
    created_by int not null,
    primary key (id),
    foreign key (created_by) references user_table(id)
);