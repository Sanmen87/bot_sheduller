import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

async def send_mail(cfg, to: str, subject: str, html: str, text: str = ""):
    if not cfg.enabled:
        return
    msg = MIMEMultipart("alternative")
    msg["From"] = cfg.from_addr
    msg["To"] = to
    msg["Subject"] = subject
    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    await aiosmtplib.send(
        message=msg,
        hostname=cfg.host,
        port=cfg.port,
        username=cfg.user,
        password=cfg.password,
        start_tls=cfg.starttls,
    )