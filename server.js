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

// ----- FUNÇÃO AUXILIAR PARA BUSCAR NOTÍCIAS -----
async function fetchNews(query = 'tecnologia') {
  try {
    const apiKey = process.env.NEWS_API_KEY;
    const pageSize = 100; // pegar até 100 notícias de uma vez
    const response = await axios.get(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=pt&pageSize=${pageSize}&apiKey=${apiKey}`
    );

    return response.data.articles.map(a => ({
      title: a.title,
      description: a.description || a.content,
      url: a.url,
      urlToImage: a.urlToImage,
      source: a.source.name
    }));
  } catch (err) {
    console.error("Erro ao buscar notícias:", err.message);
    return [];
  }
}

// ----- ROTA HOME -----
app.get('/', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.render('home', { user: null, articles: [], query: "" });
  }
  const articles = await fetchNews();
  res.render('home', { user: req.user, articles, query: "" });
});

// ----- ROTA DE PESQUISA -----
app.get('/search', async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect('/');
  }
  const q = req.query.q || 'tecnologia';
  const articles = await fetchNews(q);
  res.render('home', { user: req.user, articles, query: q });
});

// ----- LOGIN (TELA) -----
app.get('/login', (req, res) => {
  res.render('login', { user: req.user || null });
});

// ----- LOGIN LOCAL -----
app.post('/login', (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) return next(err);
    if (!user) return res.redirect('/login');

    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect('/');
    });
  })(req, res, next);
});

// ----- REGISTRO -----
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.json({ success: false, message: "❌ Email já está em uso." });

    const hashed = await bcrypt.hash(password, 10);
    const user = new User({ email, password: hashed, name: name || email });
    await user.save();
    return res.json({ success: true, message: "✅ Cadastro realizado com sucesso!" });
  } catch (err) {
    console.error("Erro no registro:", err);
    return res.json({ success: false, message: "❌ Erro no servidor. Tente novamente." });
  }
});

// ----- LOGIN GOOGLE -----
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get('/auth/google/callback', (req, res, next) => {
  passport.authenticate('google', (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/login');
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect('/');
    });
  })(req, res, next);
});

// ----- LOGIN GITHUB -----
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));
app.get('/auth/github/callback', (req, res, next) => {
  passport.authenticate('github', (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/login');
    req.logIn(user, (err) => {
      if (err) return next(err);
      return res.redirect('/');
    });
  })(req, res, next);
});

// ----- LOGOUT -----
app.get('/logout', (req, res, next) => {
  req.logout(function(err) {
    if (err) return next(err);
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.redirect('/');
    });
  });
});

// ----- INICIAR SERVIDOR -----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando em http://localhost:${PORT}`));
