/**
 * @package: mi-sports
 * @repository https://github.com/qiangmouren/mi-sports
 * @create: 2021-08-16 11:35:37
 * -----
 * @last-modified: 2021-09-15 09:16:48
 * -----
 */
const debug = true;

const moment = require('moment');
const url = require('url');
const path = require('path');
const fs = require('fs');

const querystring = require('querystring');
const axios = require('axios').default.create({ validateStatus: false });
const headers = { // cspell-checker:disable-next-line
    'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9; MI 6 MIUI/20.6.18)'
};

async function get_app_token (login_token) {
    const resp = await axios.get("https://account-cn.huami.com/v1/client/app_tokens", {
        headers,
        params: {
            // cspell-checker:disable-next-line
            app_name: 'com.xiaomi.hm.health',
            // cspell-checker:disable-next-line
            dn: "api-user.huami.com,api-mifit.huami.com,app-analytics.huami.com",
            login_token,
        }
    })

    const app_token = resp.data.token_info.app_token;
    return app_token
}

async function login (user, password) {
    const resp = await axios.request({
        method: 'post',
        maxRedirects: 0,
        url: `https://api-user.huami.com/registrations/+86${user}/tokens`,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "User-Agent": "MiFit/4.6.0 (iPhone; iOS 14.0.1; Scale/2.00)"
        },
        data: querystring.stringify({
            "client_id": "HuaMi",
            "password": password,
            "redirect_uri": "https://s3-us-west-2.amazonaws.com/hm-registration/successsignin.html",
            "token": "access"
        })
    })
    const { searchParams } = new url.URL(resp.headers.location)
    const access = searchParams.get('access');

    debug && console.log("access_code获取成功！")
    debug && console.log(access)

    const { data } = await axios.request({
        method: 'post',
        url: "https://account.huami.com/v2/client/login",
        headers,
        data: querystring.stringify({ // cspell-checker:disable-next-line
            "app_name": "com.xiaomi.hm.health",
            "app_version": "4.6.0",
            "code": access,
            "country_code": "CN",
            "device_id": "2C8B4939-0CCD-4E94-8CBA-CB8EA6E613A1",
            "device_model": "phone",
            "grant_type": "access_token",// cspell-checker:disable-next-line
            "third_name": "huami_phone",
        })
    });

    const login_token = data["token_info"]["login_token"]
    debug && console.log("login_token获取成功！")
    debug && console.log(login_token)

    const user_id = data["token_info"]["user_id"]
    debug && console.log("user_id获取成功！")
    debug && console.log(user_id)

    return { login_token, user_id };
}
async function main (username, password, step) {

    let user;
    let user_id;
    let app_token;
    fs.existsSync('./cache') || await fs.promises.mkdir('./cache');
    const data_file = path.join(__dirname, `./cache/${username}.json`);
    if (fs.existsSync(data_file)) {
        user = require(data_file);
        app_token = user.app_token;
        user_id = user.user_id;
    } else {
        user = await login(username, password);
        app_token = await get_app_token(user.login_token);
        user_id = user.user_id;
        await fs.promises.writeFile(data_file, JSON.stringify({ app_token, user_id }));
    }

    const today = moment().format('YYYY-MM-DD');
    const data_json = await fs.promises.readFile('data.txt', { encoding: 'utf8' });

    const { data } = await axios.request({
        method: 'post',
        url: `https://api-mifit-cn.huami.com/v1/data/band_data.json?t=${Date.now()}`,
        headers: { // cspell-checker:disable-next-line
            "apptoken": app_token,
            "Content-Type": "application/x-www-form-urlencoded",
            ...headers
        },
        data: querystring.stringify({
            userid: user_id,
            last_sync_data_time: 1597306380,
            device_type: 0, // cspell-checker:disable-next-line
            last_deviceid: "DA932FFFFE8816E7",
            data_json: decodeURIComponent(
                data_json
                    .toString()
                    .replace(/(date%22%3A%22).*?(%22%2C%22data)/g, `$1${today}$2`)
                    .replace(/(ttl%5C%22%3A).*?(%2C%5C%22dis)/g, `$1${step}$2`)
            )
        })
    })
    if (data.message == 'invalid token') {
        console.log('token过期，自动刷新。');
        await fs.promises.rm(data_file);
        await main(username, password, step);
        return;
    }
    if (data.message == 'success') {
        console.log('帐号', username, '提交', step, '步成功');
        return;
    }
    console.log(data)
}

function getRandomInt (min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

main(
    '修改为小米运动账号',
    '修改为小米运动密码',
    /** 这是一个步数的随机范围 */
    getRandomInt(28000, 35000)
)