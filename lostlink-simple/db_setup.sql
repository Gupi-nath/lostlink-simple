-- LostLink · MySQL Schema
-- Run this in MySQL Workbench OR via: node db_setup.js

CREATE DATABASE IF NOT EXISTS lostlink
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE lostlink;

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(200) NOT NULL,
  email         VARCHAR(200) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('student','admin') NOT NULL DEFAULT 'student',
  phone         VARCHAR(50),
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS items (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  user_id          INT NOT NULL,
  type             ENUM('lost','found') NOT NULL,
  title            VARCHAR(300) NOT NULL,
  description      TEXT,
  category         VARCHAR(100) NOT NULL,
  location         VARCHAR(300) NOT NULL,
  event_date       DATE NOT NULL,
  verify_question  VARCHAR(500),
  status           ENUM('open','claimed','returned') NOT NULL DEFAULT 'open',
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS claims (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  item_id      INT NOT NULL,
  claimant_id  INT NOT NULL,
  answer       VARCHAR(500) NOT NULL,
  status       ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  note         TEXT,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at  DATETIME,
  FOREIGN KEY (item_id)     REFERENCES items(id) ON DELETE CASCADE,
  FOREIGN KEY (claimant_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
