const { json } = require('body-parser');
const express = require('express'),
      session = require('express-session'),
     { faker } = require('@faker-js/faker/locale/ru'),
     jsonfile = require('jsonfile'),
     bodyParser = require('body-parser'),
     jwt = require('jsonwebtoken'),
     { v4: uuidv4 } = require('uuid'),
     dotenv = require('dotenv'),
     auth = require('./middleware/auth'),
     { refreshTokens } = require('./utils/refreshTokens'),
     { validateForm } = require('./utils/validateSignUpForm'),
     bcrypt = require('bcrypt');

dotenv.config()
process.env.TOKEN_SECRET;

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(session({
    secret: process.env.SESSION_KEY,
    saveUninitialized: true
}))

const path = './books.json';

const createBookData = function(index) {
    const genres = ["Фантастика", "Научная фантастика", "Приключения", "Романтика", "Драма", "Ужасы"]
    return {
        id: index + 1,
        name: faker.music.songName(),
        giveDate: faker.date.past().toLocaleDateString("ru"),
        backDate: faker.date.future().toLocaleDateString("ru"),
        author: faker.name.fullName(),
        tags: faker.helpers.arrayElements(genres),
        year: faker.date.past(30).getFullYear()
    }
}

const books = Array.from({ length: 50 }).map((_, index) => createBookData(index));
jsonfile.writeFileSync(path, books, { spaces: 2 })

app.get('/api/book', auth, (req, res) => {
    const books = jsonfile.readFileSync(path);
    
    return res.status(200).json({
        success: true,
        books: books
    })
})


app.post('/signup', validateForm, async (req, res) => {
    const { username, password, email } = req.body;
    const salt = 10;

    const genedSalt = await bcrypt.genSalt(salt);
    const hashedPassword = await bcrypt.hash(password, genedSalt)

    const path = "./models/users.json"

    jsonfile.readFile(path, (err, data) => {
        if(err) throw err;
        else {
            const users = data;
            users.push({
                id: data.length + 1,
                username: username,
                password: hashedPassword,
                email: email,
            })

            jsonfile.writeFile(path, users, { spaces: 2 }, (err) => {
                if(err) throw err;
                res.status(200).json({
                    message: "user added"
                })
            })
        }
    })
})

app.post('/login', (req, res) => {
    const path = "./models/users.json"

    const { username: loginUsername, password: loginPassword } = req.body;
    const users = jsonfile.readFileSync(path);
    const user = users.find(async (username, password) => { 
        return username === loginUsername && await bcrypt.compare(loginPassword, password);
    })

    if(user) {
        const accessToken = jwt.sign({username: loginUsername, refreshToken: user.refreshToken}, process.env.TOKEN_SECRET, {expiresIn: "10s"});
        const refreshToken = uuidv4()

        const users = jsonfile.readFileSync(path);
        const index = users.findIndex(({username}) => username === loginUsername );

        users[index].accessToken = accessToken;
        users[index].refreshToken = refreshToken;
        jsonfile.writeFileSync(path, users, { spaces: 2 })
    
        req.session.token = accessToken
        req.session.refreshToken = refreshToken;
    
        return res.status(200).json({
            token: accessToken,
            refreshToken: refreshToken
        });
    } else {
        return res.status(403).json({
            message: 'Username or password is incorrect'
        })
    }

})

app.post('/refresh-tokens', (req, res) => {
    const { refreshToken } = req.body;
    const tokens = refreshTokens(refreshToken, users);
    return res.status(200).json({
        tokens
    })
})

app.get('/api/book/:id', auth, (req, res) => {
    const books = jsonfile.readFileSync(path);
    const book = books.find(({ id }) => id == req.params.id)
    return res.status(200).json({
        success: true,
        book: book
    });
})

app.post('/api/book', auth, (req, res) => {
    const books = jsonfile.readFileSync(path);
    const book = {
        id: faker.datatype.uuid(),
        name: req.body.name,
        giveDate: req.body.giveDate,
        backDate: req.body.backDate,
        author: req.body.author,
        tags: req.body.tags?.split(', '),
        year: req.body.year
    }

    books.push(book)

    jsonfile.writeFileSync(path, books, { spaces: 2 });
    
    return res.status(200).json({
        success: true,
        book: book
    });
})

app.delete('/api/book/:id', auth, (req, res) => {
    const books = jsonfile.readFileSync(path);
    const bookIndex = books.findIndex(({ id }) => id == req.params.id);


    if(bookIndex === -1) {
        res.send('book not found');
        return;
    }

    books.splice(bookIndex, 1);

    jsonfile.writeFileSync(path, books, { spaces: 2 });

    return res.status(200).json({
        success: true,
        message: 'book has been deleted'
    })
})

app.put('/api/book/:id', auth, (req, res) => {
    const books = jsonfile.readFileSync(path);
    const bookIndex = books.findIndex(({ id }) => id == req.params.id);


    if(bookIndex === -1) {
        res.send('book not found');
        return;
    }

    const targetBook = books[bookIndex];

    books[bookIndex] = {
        id: targetBook.id,
        name: req.body.name ?? targetBook.name,
        giveDate: req.body.giveDate ?? targetBook.giveDate,
        backDate: req.body.backDate ?? targetBook.backDate,
        author: req.body.author ?? targetBook.author,
        tags: req.body.tags?.split(', ') ?? targetBook.tags,
        year: req.body.year ?? targetBook.year
    }

    jsonfile.writeFileSync(path, books, { spaces: 2 });
    return res.status(200).json({
        status: "success",
        message: "book has been edited"
    })

})

app.listen(port, () => console.log('started'))

module.exports = app