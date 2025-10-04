const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const bcrypt = require('bcrypt');

const User = require('./models/User');

module.exports = function(passport) {

  // ---- LOGIN LOCAL ----
  passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
    try {
      const user = await User.findOne({ email });
      if (!user) return done(null, false, { message: 'Usuário não encontrado' });

      const match = await bcrypt.compare(password, user.password);
      if (!match) return done(null, false, { message: 'Senha incorreta' });

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }));

  // ---- LOGIN GOOGLE ----
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Verifica se já existe por googleId
      let user = await User.findOne({ googleId: profile.id });
      if (user) return done(null, user);

      // Tenta encontrar por email
      let existingUser = await User.findOne({ email: profile.emails[0].value });
      if (existingUser) {
        existingUser.googleId = profile.id;
        await existingUser.save();
        return done(null, existingUser);
      }

      // Cria novo usuário se não existir
      user = new User({
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value
      });
      await user.save();
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }));

  // ---- LOGIN GITHUB ----
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: process.env.GITHUB_CALLBACK_URL,
    scope: ['user:email']
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      // Verifica se já existe por githubId
      let user = await User.findOne({ githubId: profile.id });
      if (user) return done(null, user);

      // Pega email principal, se não houver, fallback
      let email = profile.emails && profile.emails.length > 0 
        ? profile.emails[0].value 
        : `${profile.username}@github.com`;

      // Verifica se já existe por email
      let existingUser = await User.findOne({ email });
      if (existingUser) {
        existingUser.githubId = profile.id;
        await existingUser.save();
        return done(null, existingUser);
      }

      // Cria novo usuário se não existir
      user = new User({
        githubId: profile.id,
        name: profile.username,
        email: email
      });

      await user.save();
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  }));

  // ---- SERIALIZE / DESERIALIZE ----
  passport.serializeUser((user, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id);
      done(null, user);
    } catch (err) {
      done(err, null);
    }
  });
};
