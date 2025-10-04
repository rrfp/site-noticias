require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const path = require('path');
const bcrypt = require('bcrypt');
const axios = require('axios');

const User = require('./models/User');
require('./passport')(passport);

// Conectar MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("MongoDB conectado"))
.catch(err => console.log("Erro MongoDB:", err));

const app = express();

// Configurações básicas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));

// Sessão
app.use(session({
  secret: process.env.SESSION_SECRET || 'secretdemo',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Middleware de autenticação
function checkAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.redirect('/login');
}

// Notícias de fallback caso a API não retorne nada
const fallbackNews = [
  {
    title: "Notícia de teste 1",
    description: "Descrição da notícia 1",
    url: "#",
    urlToImage: null
  },
  {
    title: "Notícia de teste 2",
    description: "Descrição da notícia 2",
    url: "#",
    urlToImage: null
  }
];

// Página inicial com notícias automáticas
app.get('/', checkAuth, async (req, res) => {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    const response = await axios.get(
      `https://newsapi.org/v2/everything?q=tecnologia&language=pt&apiKey=${apiKey}`
    );

    let news = response.data.articles.map(a => ({
      title: a.title,
      description: a.description || a.content,
      url: a.url,
      urlToImage: a.urlToImage,
      source: a.source.name
    }));

    // Se a API não retornar nada, usar fallback
    if (!news || news.length === 0) news = fallbackNews;

    res.render('index', { user: req.user, news });
  } catch (err) {
    console.error("Erro ao carregar notícias da API:", err.message);
    res.render('index', { user: req.user, news: fallbackNews });
  }
});

// Login
app.get('/login', (req, res) => res.render('login'));
app.post('/login', passport.authenticate('local', {
  successRedirect: '/',
  failureRedirect: '/login'
}));

// Registro
app.get('/register', (req, res) => res.render('register'));
app.post('/register', async (req, res) => {
  try {
    const hashed = await bcrypt.hash(req.body.password, 10);
    const user = new User({
      email: req.body.email,
      password: hashed,
      name: req.body.name || req.body.email
    });
    await user.save();
    res.redirect('/login');
  } catch (err) {
    console.log(err);
    res.redirect('/register');
  }
});

// Google Auth
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback',
  passport.authenticate('google', { successRedirect: '/', failureRedirect: '/login' })
);

// GitHub Auth
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback',
  passport.authenticate('github', { successRedirect: '/', failureRedirect: '/login' })
);

// Logout
app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) return next(err);
    res.redirect('/login');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Rodando em http://localhost:${PORT}`));
