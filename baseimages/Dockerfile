FROM base/archlinux

MAINTAINER Jose Bernabeu <josep@dsic.upv.es>

RUN   pacman -Syyu --noconfirm --needed gcc make imagemagick zeromq python2 nodejs \
  &&  pacman-db-upgrade \
  &&  pacman -Syu --noconfirm --needed \
  &&  rm /var/cache/pacman/pkg/* \
  &&  pacman -Sc  --noconfirm \
  &&  mkdir /app \
  &&  ln -s /usr/bin/python2 /usr/bin/python


ONBUILD ADD package.json /tmp/
ONBUILD RUN cd /tmp && npm install && rm package.json
ONBUILD ADD . /app
ONBUILD RUN cd /app && rm -rf node_modules && mv /tmp/node_modules .
WORKDIR /app



ENTRYPOINT ["/usr/bin/npm", "start"]
