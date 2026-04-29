document.querySelectorAll('.like-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const button = form.querySelector('.like-button');
        const post = form.closest('.post');
        const likeCount = post.querySelector('[data-like-count]');

        if (button.disabled) {
            return;
        }

        button.disabled = true;

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                headers: {
                    Accept: 'application/json'
                }
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Unable to like post.');
            }

            likeCount.textContent = `${data.likes} likes`;

            if (data.liked) {
                button.textContent = 'Liked';
                button.classList.add('liked');
                return;
            }

            button.disabled = false;
        } catch (error) {
            console.error(error);
            button.disabled = false;
        }
    });
});

function createCommentElement(comment) {
    const wrapper = document.createElement('div');
    wrapper.className = 'comment new-comment';

    const avatar = document.createElement(comment.profileImage ? 'img' : 'div');
    avatar.className = 'avatar comment-avatar';

    if (comment.profileImage) {
        avatar.classList.add('avatar-image');
        avatar.src = comment.profileImage;
        avatar.alt = 'Photo de profil';
    } else {
        avatar.textContent = comment.initials;
    }

    const body = document.createElement('div');
    body.className = 'comment-body';

    const author = document.createElement('strong');
    author.textContent = comment.author;

    const text = document.createElement('p');
    text.textContent = comment.text;

    body.append(author, text);
    wrapper.append(avatar, body);

    return wrapper;
}

document.querySelectorAll('.comment-form').forEach((form) => {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const input = form.querySelector('input[name="text"]');
        const button = form.querySelector('button');
        const comments = form.closest('.comments');
        const commentsList = comments.querySelector('[data-comments-list]');
        const commentsCount = comments.querySelector('[data-comments-count]');
        const noComments = comments.querySelector('[data-no-comments]');
        const text = input.value.trim();

        if (!text) {
            input.focus();
            return;
        }

        button.disabled = true;

        try {
            const response = await fetch(form.action, {
                method: 'POST',
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ text })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || 'Unable to add comment.');
            }

            if (noComments) {
                noComments.remove();
            }

            commentsList.appendChild(createCommentElement(data.comment));
            commentsCount.textContent = data.commentsCount;
            input.value = '';
            input.focus();
        } catch (error) {
            console.error(error);
        } finally {
            button.disabled = false;
        }
    });
});
