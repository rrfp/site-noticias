const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String },
  name: { type: String },
  googleId: { type: String },
  githubId: { type: String }
});

// Exporta o modelo User corretamente
module.exports = mongoose.model("User", UserSchema);