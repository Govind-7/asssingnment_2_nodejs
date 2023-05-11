const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db;

const app = express();
app.use(express.json());
const dbpath = path.join(__dirname, "twitterClone.db");

const initializeDbAndServer = async () => {
  try {
    app.listen(3000, () => {
      console.log("Server has started");
    });
    db = await open({ filename: dbpath, driver: sqlite3.Database });
  } catch (err) {
    console.log(err.message);
    process.exit(1);
  }
};
initializeDbAndServer();

app.post("/register/", async (request, response) => {
  const details = request.body;
  const { username, password, name, gender } = details;
  const hashedPassword = await bcrypt.hash(password, 9);

  const usernameTstingQuery = `SELECT * FROM user WHERE
    username="${username}"`;
  const usernameRes = await db.get(usernameTstingQuery);

  if (usernameRes === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const sqlQuery = `INSERT INTO user (username,password,name,gender)
      VALUES("${username}","${hashedPassword}","${name}","${gender}")`;

      const res = await db.run(sqlQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

app.post("/login/", async (request, response) => {
  const details = request.body;
  const { username, password } = details;

  const usernameSearchQuery = `SELECT * FROM user 
  WHERE username="${username}"`;
  const res = await db.get(usernameSearchQuery);
  if (res === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isValidPassword = await bcrypt.compare(password, res.password);
    if (isValidPassword) {
      const payLoad = { username: username };
      const jwtToken = jwt.sign(payLoad, "my_secret_token");
      response.send({ jwtToken });
      //   console.log(jwtToken);
      response.status(200);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

const authenticationMW = (request, response, next) => {
  const token = request.headers["authorization"];
  if (token !== undefined) {
    const accessToken = token.split(" ")[1];
    jwt.verify(accessToken, "my_secret_token", async (error, payLoad) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payLoad.username;
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};
app.get("/user/tweets/feed/", authenticationMW, async (request, response) => {
  //   console.log(request.username);
  const sqlQuery = `SELECT user_id FROM user 
   WHERE username="${request.username}"`;
  const res = await db.get(sqlQuery);
  //   console.log(res.user_id);
  const sqlQuery2 = `SELECT username,tweet,date_time as dateTime FROM (follower INNER JOIN tweet ON
follower.following_user_id=tweet.user_id) AS T INNER JOIN user ON tweet.user_id=
user.user_id
WHERE follower.follower_user_id="${res.user_id}"
ORDER BY tweet.date_time DESC
LIMIT 4`;
  const res1 = await db.all(sqlQuery2);
  response.send(res1);
});

app.get("/user/following/", authenticationMW, async (request, response) => {
  const sqlQuery = `SELECT d.name  from (user INNER JOIN follower ON
   user.user_id=follower.follower_user_id)as t INNER JOIN user as d ON 
   t.following_user_id=d.user_id
   WHERE t.username="${request.username}" 
     `;

  const res = await db.all(sqlQuery);

  response.send(res);
});

app.get("/user/followers/", authenticationMW, async (request, response) => {
  const sqlQuery = `SELECT d.name from (user INNER JOIN follower ON
   user.user_id=follower.following_user_id)as t  INNER JOIN user AS d ON
   t.follower_user_id=d.user_id
  
   WHERE t.username="${request.username}" 
     `;
  const res = await db.all(sqlQuery);

  response.send(res);
});

app.get("/tweets/:tweetId/", authenticationMW, async (request, response) => {
  const twId = request.params.tweetId;

  const sqlQUery1 = `SELECT * FROM (user INNER JOIN follower ON
    user.user_id=follower.follower_id)AS t INNER JOIN tweet ON
    t.following_user_id=tweet.user_id
    WHERE user.username="${request.username}" AND
    tweet.tweet_id="${twId}"`;
  const res = await db.all(sqlQUery1);

  if (res.length !== 0) {
    const sqlQUery2 = `SELECT tweet.tweet, COUNT(DISTINCT like.like_id) as likes , COUNT(DISTINCT reply.reply_id) as replies,tweet.date_time as dateTime
  FROM (((user
  LEFT JOIN follower ON user.user_id = follower.follower_id)
  LEFT JOIN tweet ON follower.following_user_id = tweet.user_id) AS f
  LEFT JOIN like ON tweet.tweet_id = like.tweet_id) AS u
  LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
  WHERE user.username = "${request.username}"
  AND tweet.tweet_id = "${twId}"
  GROUP BY tweet.tweet_id`;
    const res1 = await db.get(sqlQUery2);
    response.send(res1);
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

app.get(
  "/tweets/:tweetId/likes/",
  authenticationMW,
  async (request, response) => {
    const twId = request.params.tweetId;

    const sqlQUer = `SELECT * FROM (user INNER JOIN follower ON
    user.user_id=follower.follower_id)AS t INNER JOIN tweet ON
    t.following_user_id=tweet.user_id
    WHERE user.username="${request.username}" AND
    tweet.tweet_id="${twId}"`;

    const res3 = await db.all(sqlQUer);

    if (res3.length !== 0) {
      const sqlQ = `SELECT *
        FROM user 
         JOIN like ON user.user_id = like.user_id 
        WHERE like.tweet_id = "${twId}"
        ORDER BY user.username 
        `;

      const res1 = await db.all(sqlQ);
      let arr = [];

      for (let item of res1) {
        arr.push(item.username);
      }
      const obj = { likes: arr };

      response.send(obj);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get(
  "/tweets/:tweetId/replies/",
  authenticationMW,
  async (request, response) => {
    const twId = request.params.tweetId;

    const sqlQUery1 = `SELECT * FROM (user INNER JOIN follower ON
    user.user_id=follower.follower_id)AS t INNER JOIN tweet ON
    t.following_user_id=tweet.user_id
    WHERE user.username="${request.username}" AND
    tweet.tweet_id="${twId}"`;
    const res = await db.all(sqlQUery1);
    if (res.length !== 0) {
      const sqlQ = `SELECT name,reply FROM reply INNER JOIN user
        ON reply.user_id=user.user_id
      WHERE reply.tweet_id="${twId}"`;
      const res1 = await db.all(sqlQ);

      const arr = [];

      for (const item of res1) {
        arr.push(item);
      }
      const obj = { replies: arr };
      response.send(obj);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

app.get("/user/tweets/", authenticationMW, async (request, response) => {
  const sqlQuery1 = `SELECT tweet.tweet, COUNT(DISTINCT like.like_id) AS
   likes,
   COUNT(DISTINCT reply.reply_id) AS replies, tweet.date_time AS dateTime
FROM tweet
LEFT JOIN user ON tweet.user_id = user.user_id
LEFT JOIN like ON tweet.tweet_id = like.tweet_id
LEFT JOIN reply ON tweet.tweet_id = reply.tweet_id
WHERE user.username = "${request.username}"
GROUP BY tweet.tweet_id;
    `;
  const res = await db.all(sqlQuery1);
  response.send(res);
});

app.post("/user/tweets/", authenticationMW, async (request, response) => {
  const sqlTsting = `SELECT user_id from user 
   WHERE username="${request.username}"`;

  const res1 = await db.get(sqlTsting);
  //   console.log(res1.user_id);
  const date = new Date();
  //   console.log(date);

  const tweet = request.body.tweet;
  //   console.log(tweet);

  const sqlQ = `INSERT INTO tweet(tweet,user_id,date_time)
  VALUES("${tweet}","${res1.user_id}","${date}")`;

  const res2 = await db.run(sqlQ);
  response.send("Created a Tweet");
});

app.delete("/tweets/:tweetId/", authenticationMW, async (request, response) => {
  const twId = request.params.tweetId;
  const testingSql = `SELECT * FROM user INNER JOIN tweet ON 
   user.user_id=tweet.user_id
   WHERE user.username="${request.username}" AND
   tweet.tweet_id="${twId}"`;
  const res1 = await db.get(testingSql);

  if (res1 !== undefined) {
    const sql = `DELETE FROM tweet WHERE tweet_id="${twId}"`;

    const res = await db.run(sql);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});
module.exports = app;
