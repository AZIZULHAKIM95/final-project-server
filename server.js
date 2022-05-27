const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');

require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectID } = require('mongodb');
const { verifyJWT } = require('./utils');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
app.set("json spaces", 2)

// MongoDB Credentials
const admin = process.env.DB_USER;
const password = process.env.DB_PASS;
const uri = `mongodb+srv://${admin}:${password}@cluster0.fgok3.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri,
    {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });




// API ENDPOINT
async function run() {
    try {

        await client.connect();
        console.log('DataBase Connected Successfully!!');

        const database = client.db("zeondatabase");
        const userCollection = database.collection("users");
        const productCollection = database.collection("products");
        const reviewCollection = database.collection("reviews");
        const ordersCollection = database.collection('orders');
        const paymentCollection = database.collection("payments");

        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.send({ message: 'forbidden' });
            }
        }

        // Payment
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body; 
            const price = service.price; 
            const amount = price * 100; 
            const paymentIntent = await stripe.paymentIntents.create(
                { 
                    amount: amount, 
                    currency: 'usd', 
                    payment_method_types: ['card'] 
                }
            );    
            res.send({ clientSecret: paymentIntent.client_secret }) 
        });

        // USER HANDLE
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = { $set: user };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign(
                { email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        });

        // GET ALL USERS
        app.get("/user", verifyJWT, verifyAdmin, async (req, res) => {
            const users = await userCollection.find({}).toArray();
            res.json(users);
        })

        // Make admin 
        app.put("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
            const { email, role } = req.body;
            const filter = { email }
            const updateDoc = {
                $set: {
                    role: role
                }
            }
            const result = await userCollection.updateOne(filter, updateDoc);

            res.json(result);

        })
        // Check Is admin
        app.get("/user/admin/:email", verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email })

            if (user.role) {
                res.send({ admin: true })
            }
            else {
                res.send({ admin: false })
            }
        })



        // Get All products
        app.get("/products", async (req, res) => {
            const query = {};
            const cursor = productCollection.find(query);
            const products = await cursor.toArray();
            // console.log("Sending all products to client");
            res.status(200).json({
                success: true,
                data: products,
                error: false

            });
        });

        // Delete Product
        app.delete("/product/:id", verifyJWT, verifyAdmin, async (req, res) => {
            const productId = req.params.id;
            const result = await productCollection.deleteOne({ _id: ObjectID(productId) });
            console.log(result);
            res.json(result);

        })


        app.post("/products", verifyJWT, verifyAdmin, async (req, res) => {
            const product = req.body;
            const result = await productCollection.insertOne(product);
            res.json({
                success: true,
                data: result
            })
        })


        // Get My ordered Products
        app.get("/orders/:user", verifyJWT, async (req, res) => {
            const user = req.params.user;
            const decodedUser = req.decoded.email;

            if (user === decodedUser) {
                const query = { user }
                const orders = await ordersCollection.find(query).toArray();
                return res.json(orders)
            }

            else {
                return res.status(403).json({
                    message: "Forbidden Access"
                })
            }
        })

        // Get A single product
        app.get('/order/:id', verifyJWT, async(req, res) =>{ 
            const id = req.params.id; 
            const query = {_id: ObjectID(id)}; 
            const order = await ordersCollection.findOne(query); 
            // console.log(order);
            res.send(order); 
        })

        // Delete ordered product
        app.delete("/order/:id/:type", verifyJWT, async (req, res) => {
            const { id: orderId, type } = req.params;

            if (type === "cancel") {
                const orderDelete = await ordersCollection.findOne({ _id: ObjectID(orderId) });
                const { deletedCount } = await ordersCollection.deleteOne({ _id: ObjectID(orderId) })
                if (deletedCount) {
                    const filter = { _id: ObjectID(orderDelete.productId) }
                    const updateDoc = {
                        $inc: {
                            stock: orderDelete.quantity
                        }
                    }
                    const productInc = await productCollection.updateOne(filter, updateDoc);
                    return res.send({ success: true });
                }
            }
            else if (type === "delete") {
                const { deletedCount } = await ordersCollection.deleteOne({ _id: ObjectID(orderId) })
                if (deletedCount) {
                    return res.send({ success: true })
                }
            }
            res.send({ success: false })
        })

        // REVIEW SECTION
        // GET ALL REVIEWS
        app.get("/reviews", async (req, res) => {
            const query = {};
            const cursor = reviewCollection.find(query);
            const reviews = await cursor.toArray();
            // console.log("Sending all reviews to client");
            res.status(200).json({
                success: true,
                data: reviews,
                error: false
            });
        });
        // ADD a review
        app.post("/reviews", async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            console.log(result);
            if (result.insertedId) {
                res.status(200).json({
                    success: true,
                    data: result,
                    error: false
                })
            }
            else {
                res.status(400).json({
                    success: false,
                    data: result,
                    error: true
                })
            }
        })


        app.patch('/order/:id', verifyJWT, async(req, res) =>{ 
            const id = req.params.id; 
            const payment = req.body; 
            const filter = {_id: ObjectID(id)}; 
            const updatedDoc = { 
                $set: { 
                    paid: true, 
                    transactionId: payment.transactionId 
                } 
            } 
            const result = await paymentCollection.insertOne(payment); 
            const updatedorder = await ordersCollection.updateOne(filter, updatedDoc); 
            res.send(updatedorder); 
        })

        // Placeorder
        app.post("/placeorder", async (req, res) => {
            const { user, address, phone, product } = req.body;
            const { _id:id, quantity } = product;
            console.log(product);
            const data = {
                user,
                productId: id,
                quantity,
                phone,
                address,
                paid: false,
                transactionId :"",
                product,
            }
            const query = { _id: ObjectID(id) }
            const productUpdate = await productCollection.updateOne(query, {
                $inc: {
                    stock: -quantity
                }
            });
            if (productUpdate.modifiedCount) {
                const result = await ordersCollection.insertOne(data);

                if (result.insertedId) {
                    res.status(200).json({
                        success: true,
                        data: result,
                        error: false
                    })
                }
                else {
                    res.status(400).json({
                        success: false,
                        data: result,
                        error: true
                    })
                }
            }
            else {
                res.status(400).json({
                    success: false,
                    data: result,
                    error: true
                })
            }

        });

    }
    finally {

    }
}

run().catch(console.dir);

app.get("/", (req, res) => {
    res.send("<h1>Hello from Zeon Warehouse</h1>")
})
app.listen(port, () => {
    console.log("Listening to port", port);
})
