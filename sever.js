const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport'); const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express(); 
const port = process.env.PORT || 5000; 
app.use(cors()); app.use(express.json()); 