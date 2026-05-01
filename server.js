const express = require('express');
const fs = require('fs');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const session = require('express-session');
const Post = require('./models/Post');
const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = 'mongodb://127.0.0.1:27017/ofppt_social';
const uploadDir = path.join(__dirname, 'public', 'uploads');
const allowedImageExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedImageExtensions.has(ext) || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed.'));
    }

    cb(null, true);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'ofppt_social_session_secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);
app.set('view engine', 'ejs');

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isValidUsername(username) {
  return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function renderAuthError(res, status, mode, message) {
  return res.status(status).render('auth', {
    mode,
    title: mode === 'login' ? 'Connexion' : 'Inscription',
    action: mode === 'login' ? '/login' : '/register',
    error: message
  });
}

app.use(async (req, res, next) => {
  try {
    req.currentUser = req.session.userId
      ? await User.findById(req.session.userId)
      : null;

    if (req.session.userId && !req.currentUser) {
      req.session.destroy(() => {});
    }

    next();
  } catch (error) {
    next(error);
  }
});

function requireAuth(req, res, next) {
  if (!req.currentUser) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({ message: 'Please login first.' });
    }

    return res.redirect('/login');
  }

  next();
}

function wantsJson(req) {
  return req.headers.accept && req.headers.accept.includes('application/json');
}

function isOwner(docUserId, userId) {
  return docUserId && docUserId.toString() === userId.toString();
}

function redirectBack(req, res) {
  return res.redirect(req.get('Referrer') || '/');
}

function collectUserIdsFromPosts(posts) {
  const ids = new Set();

  posts.forEach((post) => {
    if (post.authorId) {
      ids.add(post.authorId.toString());
    }

    (post.comments || []).forEach((comment) => {
      if (comment.authorId) {
        ids.add(comment.authorId.toString());
      }
    });
  });

  return [...ids];
}

async function getUserImagesById(userIds) {
  if (userIds.length === 0) {
    return {};
  }

  const users = await User.find({ _id: { $in: userIds } }).select('profileImage');
  return users.reduce((imagesById, user) => {
    imagesById[user._id.toString()] = user.profileImage;
    return imagesById;
  }, {});
}

async function getUserSearchById(userIds) {
  if (userIds.length === 0) {
    return {};
  }

  const users = await User.find({ _id: { $in: userIds } }).select('username email');
  return users.reduce((searchById, user) => {
    searchById[user._id.toString()] = [user.username, user.email].filter(Boolean).join(' ');
    return searchById;
  }, {});
}

// routes
app.get('/', requireAuth, async (req, res) => {
  try {
    const [posts, suggestedUsers] = await Promise.all([
      Post.find().sort({ createdAt: -1 }),
      User.find({ _id: { $ne: req.currentUser._id } }).sort({ username: 1 }).limit(8)
    ]);
    const postUserIds = collectUserIdsFromPosts(posts);
    const [userImagesById, userSearchById] = await Promise.all([
      getUserImagesById(postUserIds),
      getUserSearchById(postUserIds)
    ]);

    res.render('home', {
      posts,
      suggestedUsers,
      userImagesById,
      userSearchById,
      followedUserIds: (req.currentUser.following || []).map((userId) => userId.toString()),
      likeUserId: req.currentUser._id.toString(),
      currentUser: req.currentUser
    });
  } catch (error) {
    console.error('Failed to load posts:', error.message);
    res.status(500).send('Unable to load posts.');
  }
});

app.get('/profile', requireAuth, async (req, res) => {
  try {
    const posts = await Post.find({ authorId: req.currentUser._id }).sort({ createdAt: -1 });
    const totalLikes = posts.reduce((total, post) => total + post.likes, 0);
    const totalComments = posts.reduce((total, post) => total + (post.comments || []).length, 0);

    res.render('profile', {
      posts,
      totalLikes,
      totalComments,
      likeUserId: req.currentUser._id.toString(),
      currentUser: req.currentUser
    });
  } catch (error) {
    console.error('Failed to load profile:', error.message);
    res.status(500).send('Unable to load profile.');
  }
});

app.post('/profile/upload-photo', requireAuth, (req, res) => {
  upload.single('profileImage')(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        return res.status(400).send(uploadError.message || 'Unable to upload profile photo.');
      }

      if (!req.file) {
        return res.redirect('/profile');
      }

      req.currentUser.profileImage = `/uploads/${req.file.filename}`;
      await req.currentUser.save();
      return res.redirect('/profile');
    } catch (error) {
      console.error('Failed to upload profile photo:', error.message);
      return res.status(400).send(error.message || 'Unable to upload profile photo.');
    }
  });
});

app.post('/users/:id/follow', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('Invalid user id.');
    }

    if (req.params.id === req.currentUser._id.toString()) {
      return redirectBack(req, res);
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).send('User not found.');
    }

    await Promise.all([
      User.updateOne(
        { _id: req.currentUser._id },
        { $addToSet: { following: targetUser._id } }
      ),
      User.updateOne(
        { _id: targetUser._id },
        { $addToSet: { followers: req.currentUser._id } }
      )
    ]);

    return redirectBack(req, res);
  } catch (error) {
    console.error('Failed to follow user:', error.message);
    return res.status(500).send('Unable to follow user.');
  }
});

app.post('/users/:id/unfollow', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('Invalid user id.');
    }

    if (req.params.id === req.currentUser._id.toString()) {
      return redirectBack(req, res);
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
      return res.status(404).send('User not found.');
    }

    await Promise.all([
      User.updateOne(
        { _id: req.currentUser._id },
        { $pull: { following: targetUser._id } }
      ),
      User.updateOne(
        { _id: targetUser._id },
        { $pull: { followers: req.currentUser._id } }
      )
    ]);

    return redirectBack(req, res);
  } catch (error) {
    console.error('Failed to unfollow user:', error.message);
    return res.status(500).send('Unable to unfollow user.');
  }
});

app.get('/login', (req, res) => {
  res.render('auth', {
    mode: 'login',
    title: 'Connexion',
    action: '/login',
    error: null
  });
});

app.post('/login', async (req, res) => {
  try {
    const usernameOrEmail = normalizeText(req.body.username);
    const password = req.body.password || '';

    if (!usernameOrEmail || !password) {
      return renderAuthError(res, 400, 'login', 'Username/email and password are required.');
    }

    const user = await User.findOne({
      $or: [
        { username: usernameOrEmail },
        { email: usernameOrEmail.toLowerCase() }
      ]
    });

    if (!user || !(await user.verifyPassword(password))) {
      return renderAuthError(res, 401, 'login', 'Username or password is incorrect.');
    }

    req.session.userId = user._id.toString();
    res.redirect('/');
  } catch (error) {
    console.error('Login failed:', error.message);
    res.status(500).send('Unable to login.');
  }
});

app.get('/register', (req, res) => {
  res.render('auth', {
    mode: 'register',
    title: 'Inscription',
    action: '/register',
    error: null
  });
});

app.post('/register', async (req, res) => {
  try {
    const username = normalizeText(req.body.username);
    const email = normalizeText(req.body.email).toLowerCase();
    const password = req.body.password || '';

    if (!isValidUsername(username)) {
      return renderAuthError(
        res,
        400,
        'register',
        'Username must be 3-30 characters and use only letters, numbers, or underscores.'
      );
    }

    if (!isValidEmail(email)) {
      return renderAuthError(res, 400, 'register', 'Please enter a valid email address.');
    }

    if (password.length < 8) {
      return renderAuthError(res, 400, 'register', 'Password must contain at least 8 characters.');
    }

    const existingUser = await User.findOne({
      $or: [{ username }, { email }]
    });

    if (existingUser) {
      return renderAuthError(res, 409, 'register', 'This username or email is already used.');
    }

    const passwordHash = await User.hashPassword(password);
    const user = await User.create({
      username,
      email,
      passwordHash
    });

    req.session.userId = user._id.toString();
    res.redirect('/');
  } catch (error) {
    console.error('Registration failed:', error.message);
    res.status(500).send('Unable to register.');
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/login');
  });
});

app.post('/post', requireAuth, (req, res) => {
  upload.single('image')(req, res, async (uploadError) => {
    try {
      if (uploadError) {
        return res.status(400).send(uploadError.message || 'Unable to upload image.');
      }

      const content = normalizeText(req.body.content);
      const image = req.file ? `/uploads/${req.file.filename}` : '';

      if (!content && !image) {
        return res.status(400).send('Post content or image is required.');
      }

      await Post.create({
        content,
        image,
        author: req.currentUser.username,
        authorId: req.currentUser._id
      });
      res.redirect('/');
    } catch (error) {
      console.error('Failed to create post:', error.message);
      res.status(400).send(error.message || 'Unable to create post.');
    }
  });
});

app.post('/post/:id/edit', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('Invalid post id.');
    }

    const content = normalizeText(req.body.content);
    if (!content) {
      return res.status(400).send('Post content is required.');
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).send('Post not found.');
    }

    if (!isOwner(post.authorId, req.currentUser._id)) {
      return res.status(403).send('You can only edit your own posts.');
    }

    post.content = content;
    await post.save();
    res.redirect('/');
  } catch (error) {
    console.error('Failed to edit post:', error.message);
    res.status(500).send('Unable to edit post.');
  }
});

app.post('/post/:id/delete', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).send('Invalid post id.');
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).send('Post not found.');
    }

    if (!isOwner(post.authorId, req.currentUser._id)) {
      return res.status(403).send('You can only delete your own posts.');
    }

    await Post.deleteOne({ _id: post._id });
    res.redirect('/');
  } catch (error) {
    console.error('Failed to delete post:', error.message);
    res.status(500).send('Unable to delete post.');
  }
});

app.post('/post/:id/like', requireAuth, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid post id.' });
    }

    const likeUserId = req.currentUser._id.toString();
    const updatedPost = await Post.findOneAndUpdate(
      {
        _id: req.params.id,
        likedBy: { $ne: likeUserId }
      },
      {
        $inc: { likes: 1 },
        $addToSet: { likedBy: likeUserId }
      },
      { new: true }
    );

    if (updatedPost) {
      return res.json({
        liked: true,
        likes: updatedPost.likes
      });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found.' });
    }

    res.json({
      liked: post.likedBy.includes(likeUserId),
      likes: post.likes
    });
  } catch (error) {
    console.error('Failed to like post:', error.message);
    res.status(500).json({ message: 'Unable to like post.' });
  }
});

async function addComment(req, res) {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      if (wantsJson(req)) {
        return res.status(400).json({ message: 'Invalid post id.' });
      }

      return res.status(400).send('Invalid post id.');
    }

    const text = normalizeText(req.body.text || req.body.content);
    if (!text) {
      if (wantsJson(req)) {
        return res.status(400).json({ message: 'Comment text is required.' });
      }

      return res.status(400).send('Comment text is required.');
    }

    const post = await Post.findByIdAndUpdate(
      req.params.id,
      {
        $push: {
          comments: {
            author: req.currentUser.username,
            authorId: req.currentUser._id,
            text
          }
        }
      },
      { new: true }
    );

    if (!post) {
      if (wantsJson(req)) {
        return res.status(404).json({ message: 'Post not found.' });
      }

      return res.status(404).send('Post not found.');
    }

    const comment = post.comments[post.comments.length - 1];
    if (wantsJson(req)) {
      return res.json({
        comment: {
          author: comment.author,
          text: comment.text,
          initials: comment.author.slice(0, 2).toUpperCase(),
          profileImage: req.currentUser.profileImage
        },
        commentsCount: post.comments.length
      });
    }

    res.redirect('/');
  } catch (error) {
    console.error('Failed to add comment:', error.message);
    if (wantsJson(req)) {
      return res.status(500).json({ message: 'Unable to add comment.' });
    }

    res.status(500).send('Unable to add comment.');
  }
}

app.post('/posts/:id/comment', requireAuth, addComment);
app.post('/post/:id/comment', requireAuth, addComment);

app.post('/post/:postId/comment/:commentId/delete', requireAuth, async (req, res) => {
  try {
    if (
      !mongoose.Types.ObjectId.isValid(req.params.postId) ||
      !mongoose.Types.ObjectId.isValid(req.params.commentId)
    ) {
      return res.status(400).send('Invalid id.');
    }

    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).send('Post not found.');
    }

    const comment = post.comments.id(req.params.commentId);
    if (!comment) {
      return res.status(404).send('Comment not found.');
    }

    const canDelete = isOwner(post.authorId, req.currentUser._id) || isOwner(comment.authorId, req.currentUser._id);
    if (!canDelete) {
      return res.status(403).send('You can only delete your comments or comments on your posts.');
    }

    comment.deleteOne();
    await post.save();
    res.redirect('/');
  } catch (error) {
    console.error('Failed to delete comment:', error.message);
    res.status(500).send('Unable to delete comment.');
  }
});

async function startServer() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`MongoDB connected: ${MONGO_URI}`);

    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }
}

startServer();
