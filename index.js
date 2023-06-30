const express = require("express");
const app = express();
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());
const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorized Access" });
  }
  // bearer token
  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorized Access" });
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.n0q8wig.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    client.connect();

    const usersCollection = client.db("eliteGamingDB").collection("users");
    const productsCollection = client
      .db("eliteGamingDB")
      .collection("products");
    const purchasesCollection = client
      .db("eliteGamingDB")
      .collection("purchases");
    const paymentsCollection = client
      .db("eliteGamingDB")
      .collection("payments");

    // generate jwt token
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });

      res.send({ token });
    });

    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden Access" });
      }
      next();
    };

    // users related apis
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await usersCollection.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await usersCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: "user already exists" });
      }

      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/role/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: body.role,
        },
      };
      const result = await usersCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // products related api
    app.get("/products", async (req, res) => {
      const result = await productsCollection.find().toArray();
      res.send(result);
    });

    app.get("/products/featured", async (req, res) => {
      const result = await productsCollection
        .find({ total_sold: { $gt: 50 } })
        .toArray();
      res.send(result);
    });

    app.get("/products/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await productsCollection.findOne(query);
      res.send(result);
    });

    app.post("/products", verifyJWT, verifyAdmin, async (req, res) => {
      const addedProduct = req.body;
      const result = await productsCollection.insertOne(addedProduct);
      res.send(result);
    });

    app.patch("/products/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: body,
      };
      const result = await productsCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // purchases related apis
    app.get("/purchases/bookmarked", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { user_email: email, payment_status: "bookmarked" };
      const result = await purchasesCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/purchases/purchased", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { user_email: email, payment_status: "purchased" };
      const result = await purchasesCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/purchases/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await purchasesCollection.findOne(query);
      res.send(result);
    });

    app.post("/purchases", async (req, res) => {
      const body = req.body;
      const query = {
        user_email: body.user_email,
        product_name: body.product_name,
        payment_status: body.payment_status,
      };
      const existingProduct = await purchasesCollection.findOne(query);
      if (existingProduct) {
        return res.status(400).send({ message: "Product already exists" });
      }
      const result = await purchasesCollection.insertOne(body);
      res.send(result);
    });

    app.patch("/purchases/:id", async (req, res) => {
      const id = req.params.id;
      const body = req.body;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: body,
      };
      const result = await purchasesCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    app.delete("/purchases/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await purchasesCollection.deleteOne(query);
      res.send(result);
    });

    // create payment intent
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = price * 100;

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // payments related api
    app.get("/payments", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await paymentsCollection
        .find(query)
        .sort({ _id: -1 })
        .toArray();
      res.send(result);
    });

    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("EliteGaming is running");
});

app.listen(port, () => {
  console.log(`EliteGaming is running on port ${port}`);
});
