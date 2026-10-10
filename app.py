from flask import Flask, render_template, request, Response, jsonify, send_from_directory, redirect, abort
import smtplib
from email.mime.text import MIMEText
import os
import re
import requests
from dotenv import load_dotenv

# .env 読み込み
load_dotenv()

# メール送信は Google Apps Script(GAS)の中継ウェブアプリ経由で行う。
# Renderの無料プランはGmailへのSMTP送信がブロックされるため。
# GAS_URL は Render の環境変数に設定。受信先は GAS 側の MAIL_TO で決まる。
GAS_URL = os.getenv("GAS_URL")

# (予備)GAS_URL が無い場合のみ Gmail SMTP で送る。Renderの有料プランで使う想定。
EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASS = os.getenv("EMAIL_PASS")
MAIL_TO = os.getenv("MAIL_TO", "atsushi.iwmr@gmail.com")

# ページのHTMLは pages/、画像・動画・CSS・JSは assets/ に置く(URLは今までどおり /static/...)
app = Flask(__name__, template_folder='pages', static_folder='assets', static_url_path='/static')


def send_mail(subject, body, reply_to=''):
    """フォームの内容をメールで送る。失敗したら例外を投げる。"""
    if GAS_URL:
        r = requests.post(GAS_URL, json={'subject': subject, 'body': body, 'replyTo': reply_to}, timeout=30)
        r.raise_for_status()
        result = r.json()
        if not result.get('ok'):
            raise RuntimeError(f"GAS error: {result.get('error')}")
        return
    if not EMAIL_USER or not EMAIL_PASS:
        raise RuntimeError('メール送信の設定がありません(GAS_URL か EMAIL_USER/EMAIL_PASS を設定してください)')
    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = subject
    msg['From'] = EMAIL_USER
    msg['To'] = MAIL_TO
    if reply_to:
        msg['Reply-To'] = reply_to
    with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=30) as server:
        server.login(EMAIL_USER, EMAIL_PASS)
        server.send_message(msg)


SITE = 'https://ato-sns.com'
SERVICES = ('video', 'reels', 'sns', 'ec')
LASTMOD = '2026-10-10'


def page(template, lang=None, path='/', **kw):
    """ページを描画する。lang='en' なら /en 付きのURL。canonical と hreflang 用のURLもここで決める。"""
    en_path = '/en' if path == '/' else '/en' + path
    return render_template(
        template, lang=lang, page_path=path,
        P='/en' if lang == 'en' else '',            # 内部リンクの頭につける
        href_ja=path, href_en=en_path,
        url_ja=SITE + path, url_en=SITE + en_path,
        canonical=SITE + (en_path if lang == 'en' else path),
        **kw)


@app.route('/')
def index():
    return page('index.html')


@app.route('/about')
@app.route('/en/about', endpoint='about_en', defaults={'lang': 'en'})
def about(lang=None):
    return page('about.html', lang, '/about')


@app.route('/services/<slug>')
@app.route('/en/services/<slug>', endpoint='service_en', defaults={'lang': 'en'})
def service(slug, lang=None):
    if slug not in SERVICES:
        abort(404)
    return page(f'services/{slug}.html', lang, f'/services/{slug}', slug=slug)

@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.static_folder, 'icons'), 'favicon.ico', mimetype='image/vnd.microsoft.icon')

@app.route('/google<token>.html')
def google_verify(token):
    """Google Search Console の所有権確認ファイル(リポジトリ直下に置いた googleXXXX.html)を返す。"""
    if not re.fullmatch(r'[0-9A-Za-z]+', token):
        return Response('Not found', status=404)
    return send_from_directory(app.root_path, f'google{token}.html', mimetype='text/html')

@app.route('/robots.txt')
def robots_txt():
    content = "User-agent: *\nAllow: /\nSitemap: https://ato-sns.com/sitemap.xml"
    return Response(content, status=200, mimetype='text/plain; charset=utf-8')
LINE_URL = 'https://lin.ee/qmngoTF'

@app.route('/book')
def book():
    # カレンダー予約はやめた。古いリンクから来た人は公式LINEへ
    return redirect(LINE_URL, code=302)

@app.route('/en')
def index_en():
    return page('index.html', 'en')
@app.route('/sitemap.xml')
def sitemap():
    # 日本語と英語の両方のURLを載せ、hreflang で対応を示す
    pages = [('/', '1.0'), ('/about', '0.7')] + [(f'/services/{s}', '0.9') for s in SERVICES]
    rows = []
    for path, prio in pages:
        en = '/en' if path == '/' else '/en' + path
        alt = (f'    <xhtml:link rel="alternate" hreflang="ja" href="{SITE}{path}"/>\n'
               f'    <xhtml:link rel="alternate" hreflang="en" href="{SITE}{en}"/>\n'
               f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{path}"/>\n')
        for loc, p in ((path, prio), (en, str(round(float(prio) * 0.8, 1)))):
            rows.append(f'  <url>\n    <loc>{SITE}{loc}</loc>\n    <lastmod>{LASTMOD}</lastmod>\n    <priority>{p}</priority>\n{alt}  </url>')
    sitemap_xml = ('<?xml version="1.0" encoding="UTF-8"?>\n'
                   '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
                   + '\n'.join(rows) + '\n</urlset>')
    return Response(sitemap_xml, mimetype='application/xml')

@app.route('/send', methods=['POST'])
def send():
    name = request.form['name']
    company = request.form.get('company', '')
    email = request.form['email']
    phone = request.form.get('phone', '')
    inquiry = request.form['inquiry']
    source = request.form.get('source', '')

    body = f"""【お問い合わせ内容】

名前: {name}
会社名・団体名: {company}
メールアドレス: {email}
電話番号: {phone}
どこで知ったか: {source}

▼お問い合わせ内容:
{inquiry}
"""

    try:
        send_mail("【サイトからのお問い合わせ】", body, email)
        return "送信が完了しました。ありがとうございました！"
    except Exception:
        app.logger.exception('send mail failed')
        return "送信に失敗しました。時間をおいて再度お試しください。"


@app.route('/apply', methods=['POST'])
def apply():
    """LPの問い合わせフォーム。内容をMAIL_TOに送る。"""
    data = request.get_json(silent=True) or request.form
    if data.get('botcheck'):
        return jsonify(ok=True)
    name = (data.get('name') or '').strip()[:200]
    email = (data.get('email') or '').strip()[:200]
    kind = (data.get('type') or '').strip()[:300]
    company = (data.get('company') or '').strip()[:200]
    department = (data.get('department') or '').strip()[:200]
    if not name or not email or '@' not in email or not kind:
        return jsonify(ok=False, error='missing'), 400
    account = (data.get('account') or '').strip()[:300]
    message = (data.get('message') or '').strip()[:5000]
    lang = (data.get('lang') or 'ja').strip()[:5]

    body = f"""【ATO LP 無料相談のお問い合わせ】

お名前: {name}
会社名・屋号: {company or '(未記入)'}
所属部署: {department or '(未記入)'}
メールアドレス: {email}
SNS・サイト: {account or '(未記入)'}
ご相談したいこと: {kind}
表示言語: {lang}

▼ご相談内容:
{message or '(未記入)'}
"""
    try:
        send_mail(f"【ATO LP】無料相談のお問い合わせ：{company + ' ' if company else ''}{name}", body, email)
        return jsonify(ok=True)
    except Exception:
        app.logger.exception('apply mail failed')
        return jsonify(ok=False, error='mail'), 500
