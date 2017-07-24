SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

CREATE SCHEMA eco_points;

CREATE EXTENSION citext;

SET search_path = eco_points, public, pg_catalog;

CREATE TABLE users (
    id VARCHAR(32) NOT NULL UNIQUE,
    profile INTEGER NOT NULL UNIQUE,
    email citext NOT NULL UNIQUE,
    username VARCHAR(128) NOT NULL,
    password VARCHAR(128) NOT NULL,
    google_info TEXT NULL,
    gender SMALLINT DEFAULT 0,
    birth_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE ONLY users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

CREATE TABLE users_login (
    id VARCHAR(32) NOT NULL UNIQUE,
    device_android_id VARCHAR(32) NOT NULL,
    device_serial VARCHAR(32) NOT NULL,
    device_model VARCHAR(32) NOT NULL,
    ip inet NOT NULL,
    locale VARCHAR(5) NOT NULL,
    version_code SMALLINT NOT NULL,
    version_name VARCHAR(8) NOT NULL,
    login_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE password_reset (
    id VARCHAR(32) NOT NULL UNIQUE,
    password_code CHARACTER(32) NOT NULL,
    secret INTEGER NOT NULL,
    reset_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE blocked_domains (
    id INTEGER NOT NULL UNIQUE,
    address TEXT NOT NULL
);

CREATE TABLE email_verification (
    id VARCHAR(32) NOT NULL UNIQUE,
    verification_hash VARCHAR(16) NOT NULL,
    verified BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


ALTER TABLE ONLY users_login
    ADD CONSTRAINT users_login_id_fkey FOREIGN KEY (id) REFERENCES users(id) DEFERRABLE;

ALTER TABLE ONLY password_reset
    ADD CONSTRAINT password_reset_id_fkey FOREIGN KEY (id) REFERENCES users(id) DEFERRABLE;

ALTER TABLE ONLY email_verification
    ADD CONSTRAINT email_verification_id_fkey FOREIGN KEY (id) REFERENCES users(id) DEFERRABLE;