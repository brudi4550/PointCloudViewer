DROP TABLE IF EXISTS pointcloudDB2.session_table, pointcloudDB2.upload_information_table, pointcloudDB2.cloud_table, pointcloudDB2.user_table CASCADE;

CREATE TABLE `pointcloudDB2`.`user_table` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `user_name` VARCHAR(255) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `salt` VARCHAR(255) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `user_name_UNIQUE` (`user_name` ASC) VISIBLE);

CREATE TABLE `pointcloudDB2`.`session_table` (
  `user_name` VARCHAR(255) NOT NULL,
  `expiration` BIGINT NULL,
  PRIMARY KEY (`user_name`),
  CONSTRAINT `FKC_user`
    FOREIGN KEY (`user_name`)
    REFERENCES `pointcloudDB2`.`user_table` (`user_name`)
    ON DELETE CASCADE
    ON UPDATE CASCADE);

CREATE TABLE `pointcloudDB2`.`cloud_table` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `cloud_name` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `link` VARCHAR(255) NULL,
  `public` TINYINT NULL,
  `upload_status` ENUM('UNDEFINED', 'INITIALIZED', 'COMPLETE_ORDER_SENT', 'COMPLETED', 'CANCELLED', 'ON_UPDATE') NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `cloud_and_user_UNIQUE` (`cloud_name` ASC, `created_by` ASC) VISIBLE,
  CONSTRAINT `FKC_created_by`
    FOREIGN KEY (`created_by`)
    REFERENCES `pointcloudDB2`.`user_table` (`user_name`)
    ON DELETE CASCADE
    ON UPDATE CASCADE);
