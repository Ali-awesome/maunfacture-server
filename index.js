const express = require('express');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const Stripe = require("stripe");
// const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const stripe = Stripe(
    "sk_test_51L4UAtI03Pk1Kq1HlJK25gwJ9fSxdva0gdIWjL2yoh7FNmiauE8osSOwDijDNuNXWt5qIIcgIPX2c3x2IjUuij6Z00OrtEnSA2"
);
require('dotenv').config();
const port = process.env.PORT || 5000;
const app = express();

app.use(cors());
app.use(express.json());

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized Access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' });
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.sqfg1.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const toolCollection = client.db('dbTools').collection('tool');
        const userCollection = client.db('dbTools').collection('user');
        const reviewCollection = client.db('dbTools').collection('review');
        const orderCollection = client.db('dbTools').collection('oreder');
        const paymentCollection = client.db('dbTools').collection('payments');
        const profileCollection = client.db('dbTools').collection('profile');

        // Verify Admin Function
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // Getting tools to show all and specifically
        app.get('/tools', async (req, res) => {
            const query = {};
            const result = await toolCollection.find(query).sort({ _id: -1 }).toArray();
            res.send(result)
        });
        app.get('/tools/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await toolCollection.findOne(query);
            res.send(result);
        });

        // Adding tools to database
        app.post('/tools', async (req, res) => {
            const tool = req.body;
            const result = await toolCollection.insertOne(tool);
            res.send(result)
        })

        // Putting users as admin in server
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });

        // Getting admin
        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })


        // Adding users as user to server
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateUser = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateUser, options);
            const token = jwt.sign({ email: email }, process.env.SECRET_KEY, { expiresIn: '1y' })
            res.send({ result, token });
        });

        // Creating Payment
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            console.log(service)
            const price = service.totalPrice;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        app.patch('/order/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId
                }
            }

            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })

        // Getting Users
        app.get('/user', verifyJWT, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });



        // Storing oreders in server
        app.post('/order', async (req, res) => {
            const order = req.body;
            const result = await orderCollection.insertOne(order);
            res.send(result);
        });

        app.delete("/tools/:id", async (req, res) => {
            console.log("hidfdf");
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await toolCollection.deleteOne(query);
            res.send(result);
        });

        // Getting oreders all and by email
        app.get('/orders', async (req, res) => {
            const query = {};
            const result = await orderCollection.find(query).toArray();
            res.send(result)
        });

        app.get('/order', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.query.email;
            if (email === decodedEmail) {
                const query = { email: email };
                const cursor = orderCollection.find(query);
                const orders = await cursor.toArray();
                res.send(orders);
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
        });

        // Deleting orders
        app.delete('/order/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await orderCollection.deleteOne(query);
            res.send(result);
        })


        // Adding Profile Data
        app.put("/profile", async (req, res) => {
            const email = req.query.email;
            const updateProduct = req.body;
            const query = { Email: email };
            const updated = await profileCollection.updateOne(
                query,
                { $set: updateProduct },
                { upsert: true }
            );
            const cursor = await profileCollection.findOne(query);
            res.send(cursor);
        });


        // Storing reviews to server
        app.post('/review', async (req, res) => {
            const review = req.body;
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        })


        // Getting reviews all and by name
        app.get('/reviews', async (req, res) => {
            const query = {};
            const result = await reviewCollection.find(query).sort({ _id: -1 }).toArray();
            res.send(result)
        })
        app.get('/reviewByName', async (req, res) => {
            const name = req.query.name;
            const query = { name: name };
            const result = await reviewCollection.find(query).toArray();
            res.send(result);
        });

        // Getting Profile data
        app.get('/profile', verifyJWT, async (req, res) => {
            const decodedEmail = req.decoded.email;
            const email = req.query.email;
            if (email === decodedEmail) {
                const query = { Email: email };
                const profile = await profileCollection.find(query).toArray();
                res.send(profile);
            }
            else {
                res.status(403).send({ message: 'forbidden access' })
            }
        });

        app.patch('/orders/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const body = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: body
            }

            const updatedBooking = await orderCollection.updateOne(filter, updatedDoc);
            res.send(updatedBooking);
        })

    }
    finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('running like usain bolt')
});

app.listen(port, () => {
    console.log('listening', port)
})