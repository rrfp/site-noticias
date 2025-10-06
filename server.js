require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const cors = require('cors');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const User = require('./models/User');
require('./passport')(passport);

const app = express();

// ----- MONGODB -----
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB conectado ✅"))
.catch(err => console.log("Erro MongoDB:", err));

// ----- MIDDLEWARES -----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));

// ----- SESSÃO -----
app.use(session({
  secret: process.env.SESSION_SECRET || 'secretkey',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGO_URI,
    ttl: 14 * 24 * 60 * 60
  }),
  cookie: { maxAge: 14 * 24 * 60 * 60 * 1000, sameSite: 'lax' }
}));

app.use(passport.initialize());
app.use(passport.session());

// ----- VIEW ENGINE -----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// ----- AUTENTICAÇÃO -----
function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// ----- ROTAS LOGIN/REGISTRO -----
app.get('/login', (req, res) => res.render('login'));
app.post('/login', passport.authenticate('local', { successRedirect: '/', failureRedirect: '/login' }));

app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  try {
    const existingUser = await User.findOne({ email: req.body.email });
    if (existingUser) return res.redirect('/register');

    const hashed = await bcrypt.hash(req.body.password, 10);
    const user = new User({ email: req.body.email, password: hashed, name: req.body.name || req.body.email });
    await user.save();
    res.redirect('/login');
  } catch (err) {
    console.error("Erro no registro:", err);
    res.redirect('/register');
  }
});

// ----- LOGIN GOOGLE -----
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', passport.authenticate('google', { successRedirect: '/', failureRedirect: '/login' }));

// ----- LOGIN GITHUB -----
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', passport.authenticate('github', { successRedirect: '/', failureRedirect: '/login' }));

// ----- LOGOUT -----
app.get("/logout", (req, res, next) => {
  req.logout(err => { if (err) return next(err); res.redirect("/login"); });
});

// ----- ROTA API DE NOTÍCIAS -----
const fallbackNews = [
  { title: "Notícia de teste 1", description: "Descrição da notícia 1", url: "#", urlToImage: null },
  { title: "Notícia de teste 2", description: "Descrição da notícia 2", url: "#", urlToImage: null }
];

// ----- ROTA DE NOTÍCIAS (PAGINAÇÃO) -----
app.get('/news', checkAuth, async (req, res) => {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    if (!apiKey) return res.render('news', { articles: fallbackNews, currentPage: 1, totalPages: 1, query: "" });

    const page = parseInt(req.query.page) || 1;
    const pageSize = 20;

    const response = await axios.get(
      `https://newsapi.org/v2/everything?q=tecnologia&language=pt&page=${page}&pageSize=${pageSize}&apiKey=${apiKey}`
    );

    const totalResults = response.data.totalResults;
    const totalPages = Math.ceil(totalResults / pageSize);

    const news = response.data.articles.map(a => ({
      title: a.title,
      description: a.description || a.content,
      url: a.url,
      urlToImage: a.urlToImage,
      source: a.source.name
    }));

    res.render('news', { articles: news, currentPage: page, totalPages, query: "" });

  } catch (err) {
    console.error("Erro ao buscar notícias:", err.message);
    res.render('news', { articles: fallbackNews, currentPage: 1, totalPages: 1, query: "" });
  }
});

// ----- ROTA DE BUSCA -----
app.get('/search', checkAuth, async (req, res) => {
  try {
    const query = req.query.q || "tecnologia";
    const page = parseInt(req.query.page) || 1;
    const pageSize = 20;
    const apiKey = process.env.NEWS_API_KEY;

    if (!apiKey) return res.render('news', { articles: fallbackNews, currentPage: 1, totalPages: 1, query });

    const response = await axios.get(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=pt&page=${page}&pageSize=${pageSize}&apiKey=${apiKey}`
    );

    const totalResults = response.data.totalResults;
    const totalPages = Math.ceil(totalResults / pageSize);

    const news = response.data.articles.map(a => ({
      title: a.title,
      description: a.description || a.content,
      url: a.url,
      urlToImage: a.urlToImage,
      source: a.source.name
    }));

    res.render('news', { articles: news, currentPage: page, totalPages, query });

  } catch (err) {
    console.error("Erro ao buscar na API:", err.message);
    res.render('news', { articles: fallbackNews, currentPage: 1, totalPages: 1, query: req.query.q });
  }
});

// ----- PÁGINA INICIAL -----
app.get('/', checkAuth, (req, res) => {
  res.redirect('/news'); // redireciona direto para /news
});

// ----- INICIAR SERVIDOR -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
