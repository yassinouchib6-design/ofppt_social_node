const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      match: /^[a-zA-Z0-9_]+$/
    },
    email: {
      type: String,
      required: true,
      unique: true,
      sparse: true,
      trim: true,
      lowercase: true,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    },
    passwordHash: {
      type: String,
      required: true
    },
    profileImage: {
      type: String,
      default: null
    },
    followers: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: []
    },
    following: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: 'User',
      default: []
    }
  },
  {
    timestamps: true
  }
);

userSchema.statics.hashPassword = async function hashPassword(password) {
  return bcrypt.hash(password, 12);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
