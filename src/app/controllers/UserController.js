import aws from 'aws-sdk';
import File from '../models/File';
import User from '../models/User';

import Cache from '../../lib/Cache';

const s3 = new aws.S3();

class UserController {
  async store(req, res) {
    const userExists = await User.findOne({ where: { email: req.body.email } });
    if (userExists) {
      return res.status(400).json({ error: 'User already exists.' });
    }

    const { id, name, email, provider } = await User.create(req.body);

    if (provider) {
      await Cache.invalidate('providers');
    }

    return res.json({
      id,
      name,
      email,
      provider,
    });
  }

  async update(req, res) {
    const { email, oldPassword } = req.body;

    const user = await User.findByPk(req.userId, {
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['id', 'path', 'url'],
        },
      ],
    });

    if (email && email !== user.email) {
      const userExists = await User.findOne({ where: { email } });

      if (userExists) {
        return res.status(400).json({ error: 'User already exists.' });
      }
    }

    if (oldPassword && !(await user.checkPassword(oldPassword))) {
      return res.status(401).json({ error: 'Password does not match' });
    }

    await user.update(req.body);

    const { avatar_id } = req.body;
    if (avatar_id) {
      if (user.avatar) {
        const { id: avatarDestroy, path: avatarPath } = user.avatar;

        // Deletar o Avatar antigo no SQL
        File.destroy({
          where: {
            id: avatarDestroy,
          },
        });

        // Delete Avatar antigo na AWS
        if (process.env.STORAGE_TYPE === 's3') {
          s3.deleteObject(
            {
              Bucket: process.env.AWS_BUCKET,
              Key: avatarPath,
            },
            async err => {
              if (err) console.log(err, err.stack);
              // an error occurred
              else console.log('File deleted'); // successful response
            }
          );
        }
      }
    }

    const { id, name, avatar, provider } = await User.findByPk(req.userId, {
      include: [
        {
          model: File,
          as: 'avatar',
          attributes: ['id', 'path', 'url'],
        },
      ],
    });

    // Clear Cache
    if (provider) {
      await Cache.invalidate('providers');
    }

    return res.json({
      id,
      name,
      email,
      avatar,
      provider,
    });
  }
}

export default new UserController();
