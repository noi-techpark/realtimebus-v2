--
-- PostgreSQL database dump
--

-- Dumped from database version 9.1.7
-- Dumped by pg_dump version 9.1.7
-- Started on 2014-03-09 22:38:21 CET

SET statement_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

--
-- TOC entry 7 (class 2615 OID 591656)
-- Name: data; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA beacons;

SET search_path = beacons, public, pg_catalog;

CREATE TABLE buses (
    battery SMALLINT NOT NULL,
    firmware VARCHAR(10) NOT NULL,
    hardware VARCHAR(10) NOT NULL,
    inserted TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    mac_address VARCHAR(17) NOT NULL,
    major SMALLINT NOT NULL,
    minor SMALLINT NOT NULL,
    recorded TIMESTAMP WITH TIME ZONE,
    system_id VARCHAR(12) NOT NULL
);

CREATE TABLE bus_stops (
    battery SMALLINT NOT NULL,
    firmware VARCHAR(10) NOT NULL,
    hardware VARCHAR(10) NOT NULL,
    inserted TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    mac_address VARCHAR(17) NOT NULL,
    major SMALLINT NOT NULL,
    minor SMALLINT NOT NULL,
    recorded TIMESTAMP WITH TIME ZONE,
    system_id VARCHAR(12) NOT NULL
);
