FROM fedora:latest

RUN dnf install -y openssh-server wget

RUN sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config
RUN sed -i 's/#AllowTcpForwarding yes/AllowTcpForwarding yes/' /etc/ssh/sshd_config

RUN ssh-keygen -A

RUN echo "root:foobar" | chpasswd

# Create a user batman with password foobar
RUN useradd -m batman
RUN echo "batman:foobar" | chpasswd

RUN useradd -m dave
RUN echo "dave:foobar" | chpasswd

EXPOSE 5670
CMD ["/usr/sbin/sshd", "-D", "-p", "5670"]