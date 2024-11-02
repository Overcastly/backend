const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const e = require('express');
const MongoClient = require('mongodb').MongoClient;
require('dotenv').config()

const url = process.env.DB_URL;
const client = new MongoClient(url);
client.connect();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const bcrypt = require("bcryptjs");
const { ObjectId } = require("mongodb");

app.post('/api/makepost', async (req, res, next) => {
  // incoming: title, body, image, latitude, longitude, authorId, tags
  // outgoing: error

  const {title, body, image, latitude, authorId, longitude, tags} = req.body;

  const newPost = {
    title: title, 
    body: body, 
    image: image, 
    latitude: latitude, 
    authorId: authorId, 
    longitude: longitude, 
    tags: tags 
  };
  
  let error = '';

  try {
    const db = client.db('Overcastly');
    const result = db.collection('Posts').insertOne(newPost);
  }
  catch (e) {
    error = e.toString();
  }

  // add catch for format mismatch

  let ret = { error: error };
  res.status(200).json(ret);
});

app.post('/api/searchposts', async (req, res, next) => {
  // incoming: title, body, authorId, tags
  // outgoing: title, body, image, latitude, longitude, authorId, tags
  // Partial matching w/ regex

  let error = '';

  const { title, body, authorId, tags } = req.body;

  const db = client.db('Overcastly');
  let results = [];
  const resultsBody = await db.collection('Posts').find({ $or: [{title: { $regex: title.trim() + '.*', $options: 'i' }},
              {body: { $regex: body.trim() + '.*', $options: 'i' }}, { authorId : authorId }] }).toArray();

  const resultsTags = await db.collection('Posts').find({ tags : tags }).toArray();

  if (tags.length > 0) {
    results = resultsBody.concat(resultsTags);
  }
  else {
    results = resultsBody;
  }

  let outId = -1;
  let outTitle = '';
  let outBody = '';
  let outImage = -1;
  let outLat = -1;
  let outLong = -1;
  let outTags = -1;

  let ret = [];

  for (let i = 0; i < results.length; i++) {
    outId = results[i].authorId;
    outTitle = results[i].title;
    outBody = results[i].body;
    outImage = results[i].image;
    outLat = results[i].latitude;
    outLong = results[i].longitude;
    outTags = results[i].tags;

    ret.push({
      title: outTitle,
      body: outBody,
      image: outImage,
      latitude: outLat,
      authorId: outId,
      longitude: outLong,
      tags: outTags,
      error: ''
    });
  }
  
  res.status(200).json(ret);
});

app.post('/api/findlocalposts', async (req, res, next) => {
  // incoming: latitude, longitude, distance
  // outgoing: title, body, image, latitude, longitude, authorId, tags
  // returns array of posts within distance of latitude and longitude

  let error = '';

  const { latitude, longitude, distance } = req.body;

  const db = client.db('Overcastly');
  const results = await db.collection('Posts').find({ }).sort([["_id", -1]]).toArray();

  let outId = -1;
  let outTitle = '';
  let outBody = '';
  let outImage = -1;
  let outLat = -1;
  let outLong = -1;
  let outTags = -1;

  let ret = [];

  for (let i = 0; i < results.length; i++) {
    let calcDistance = Math.sqrt((results[i].latitude - latitude) ** 2 + (results[i].longitude - longitude) ** 2)

    if (calcDistance > distance || !(results[i].hasOwnProperty('latitude') && results[i].hasOwnProperty('longitude')))
      continue;

    outId = results[i].authorId;
    outTitle = results[i].title;
    outBody = results[i].body;
    outImage = results[i].image;
    outLat = results[i].latitude;
    outLong = results[i].longitude;
    outTags = results[i].tags;

    ret.push({ title: outTitle, body: outBody, image: outImage, latitude: outLat, authorId: outId, longitude: outLong, tags: outTags });
  }
  
  res.status(200).json(ret);
});



// User registration
app.post("/api/registeruser", async (req, res, next) => {
  // incoming: username, password, firstName, lastName, email
  // outgoing: error

  const { username, password, firstName, lastName, email } = req.body;

  if (!username || !password || !firstName || !lastName || !email) {
    return res.status(400).json({ error: "Missing some registerfields :((" });
  }

  try {
    const db = client.db("Overcastly");

    const existingUser = await db.collection("Users").findOne({
      $or: [{ username }, { email }],
    });

    if (existingUser) {
      const error = existingUser.username === username
        ? "username already exists!"
        : "email has already been registered to an account......";

      return res.status(409).json({ error });
    }

    const hashedPasswd = await bcrypt.hash(password, 10);
    
    const newUser = {
      username,
      password: hashedPasswd,
      firstName,
      lastName,
      email,
    };

    await db.collection("Users").insertOne(newUser);

    return res.status(201).json({ message: "User registered successfully >W<" });

  } catch (e) {
    return res.status(500).json({ error: "A servar ewwow happend ;(" });
  }
});

// Retrieve user by Id
app.get("/api/users/:_id", async (req, res, next) => {
  // incoming: user Id
  // outgoing: user info

  try {
    const db = client.db("Overcastly");
    let _id = req.params._id;

    let readUser = await db.collection("Users").findOne({ _id: new ObjectId(_id) });

    if (!readUser) {
      return res.status(404).json({ error: "User not found :(" });
    }

    delete readUser.password;

    return res.status(200).json(readUser);

  } catch (e) {
    return res.status(500).json({ error: "couldnt fetch user details wtf!!" });
  }
});

// Update user by Id
app.put("/api/updateuser/:_id", async (req, res, next) => {
  // incoming: new user data
  // outgoing: success or error

  try {
    const db = client.db("Overcastly");
    let _id = req.params._id;

    const { firstName, lastName, email } = req.body;

    if (!firstName && !lastName && !email) {
      return res.status(400).json({ error: "you need to provide a field to update bruh" });
    }

    if (email && !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({ error: "bro yo email format fricked up" });
    }

    let readUser = await db.collection("Users").findOne(_id.ObjectId);

    if (!readUser) {
      return res.status(404).json({ error: "User not found :(" });
    }

    const updatedFields = {};

    if (firstName) {
      updatedFields.firstName = firstName;
    }

    if (lastName) {
      updatedFields.lastName = lastName;
    }

    if (email) {
      updatedFields.email = email;
    }

    const result = await db.collection("Users").updateOne(
      { _id: new ObjectId(_id) }, // searching for a specific id syntax
      { $set: updatedFields }
    );

    return res.status(200).json({ message: "updated dat user x3" });

  } catch (error) {
    return res.status(500).json({ error: "couldnt update that user wtf hapepnd" });
  }
});

// Delete user by id
app.delete("/api/deleteuser/:_id", async (req, res, next) => {
  // incoming: user Id
  // outgoing: success or error

  try {
    const db = client.db("Overcastly");
    let _id = req.params._id;

    let delResult = await db.collection("Users").deleteOne({ _id: new ObjectId(_id) });

    if (delResult.deletedCount === 0) {
      return res.status(404).json({ error: "nothing deleted, user prolly doesnt exist" });
    }

    return res.status(200).json({ message: "BOOM! get DUHLEETED" });

  } catch (e) {
    return res.status(500).json({ error: "Couldnt delete that user idk why..." });
  }
});

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    'GET, POST, PATCH, DELETE, OPTIONS'
  );
  next();
});

app.listen(5000); // start Node + Express server on port 5000
