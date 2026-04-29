const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    author: {
      type: String,
      default: 'Nom Utilisateur'
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    content: {
      type: String,
      trim: true
    }
  },
  {
    timestamps: true
  }
);

const postSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      trim: true,
      maxlength: 2000
    },
    imageUrl: {
      type: String,
      default: ''
    },
    author: {
      type: String,
      default: 'Nom Utilisateur'
    },
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    likes: {
      type: Number,
      default: 0
    },
    likedBy: {
      type: [String],
      default: []
    },
    comments: {
      type: [commentSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Post', postSchema);
