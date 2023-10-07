import axios from 'axios';
import { CookieManager } from './src/cookie.manager';
import { TransactionDto } from './src/transaction.dto';
import * as fs from 'fs';

const cookieManager = new CookieManager();

const url = 'https://www5.bancaribe.com.ve/bcm/action'
const contentType = 'application/x-www-form-urlencoded; charset=UTF-8'
const baseReferer = 'https://www5.bancaribe.com.ve/bcm/action/web/security/home'

const username = process.env.USERNAME;
const password = process.env.PASSWORD;

if (!username || !password) {
  throw new Error('Username or password not provided');
}

const instance = axios.create({
  baseURL: url,
  headers: {
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8,es;q=0.7',
    Connection: 'keep-alive',
    Host: 'www5.bancaribe.com.ve',
    Referer: baseReferer,
    'Sec-Ch-Ua': '"Google Chrome";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/',
  }
});

instance.interceptors.request.use((config) => {
  config.params = {
    random: Math.random(),
    ...config.params
  }

  const { headers } = config
  const cookie = cookieManager.toString()
  const referer = headers.referer || baseReferer

  if (cookie) {
    headers.Cookie = cookie
  }

  headers.referer = referer

  return config;
});

instance.interceptors.response.use((response) => {
  // conver headers to lowercase
  response.headers = Object.keys(response.headers).reduce<any>((acc, key) => {
    acc[key.toLowerCase()] = response.headers[key];
    return acc;
  }, {});

  if (response.headers['set-cookie']) {
    cookieManager.setCookie(response.headers['set-cookie']);
  }

  return response;
});

instance.interceptors.response.use((response) => {
  // example data "var errorDesc = \"18004 - Estimado Cliente, algunos de los datos son inv�lidos. Por favor intente nuevamente\";\r\nsetFormErrorMsg(\"form_error\", errorDesc);\r\n\r\nclearForm1();\r\nenableLoginButton();"
  const errorRegex = /var errorDesc = "(.*)";/g;
  const error = errorRegex.exec(response.data);
  if (error) {
    throw new Error(error[1]);
  }

  return response;
})

const redirectTo = async (path: string, params: any = {}) => {
  await instance.get('/web/security/redirectto', {
    params: {
      path,
      ...params,
    }
  });
}

const index = async () => {
  await instance.get('/web/security/index');
  await instance.get('/app/security/nodo');
}

const logout = async () => {
  await redirectTo('/web/security/exit');

  cookieManager.deleteAll();
}

const clearSession = async () => {
  await instance.get('/app/security/sessionclear/clear');
}

const getMovements = async (id: string) => {
  await redirectTo('/action/web/business/consultacuentabs', { id });

  await instance.post('/app/v1/business/consulta/cuentabs/paso1', `id=${id}`, {
    headers: {
      'Content-Type': contentType
    }
  });

  const { data: movements } = await instance.get(
    '/app/v1/business/consulta/cuentabs/umovimiento',
    {
      headers: {
        'Content-Type': contentType
      }
    }
  );

  const [dataSetInitializer] = movements.split('\n');
  let dataSet: any[] = eval(dataSetInitializer.split('var dataSet = ')[1].split(';')[0]);

  return dataSet.map((data: any) => TransactionDto.fromScrapper(data));
}

const login = async (retry = true): Promise<void> => {
  await index();

  const loginData = {
    isbiometria: '',
    version: '',
    platform: '',
    token_id: '',
    ti2: '',
    ti: '',
    uri: '/action/web/business/consultaglobal',
    passwd: password,
    userlogin: username
  };

  const { data: loginResponse } = await instance.post('/web/security/login', loginData, {
    headers: {
      'Content-Type': contentType
    },
  });

  if (!loginResponse || typeof loginResponse !== 'string' || !loginResponse.includes('redirectToAction(\"/action/web/business/consultaglobal\")')) {

    if (retry && loginResponse && typeof loginResponse === 'string' && loginResponse.includes('Usted se desconecto de manera incorrecta')) {
      await clearSession();
      return login(false);
    }

    throw new Error(loginResponse);
  }
}

const getAccounts = async (): Promise<string[]> => {
  await redirectTo('/action/web/business/consultaglobal');

  await instance.get('/app/v1/business/consultaglobal/search');

  const { data } = await instance.get('/app/v1/business/consultaglobal/viewsaldo', {
    headers: {
      'Content-Type': contentType
    }
  });

  return data.split('\n')
    .filter((line: string) => line.includes('saldo(')).map((line: string) => {
      const [id, type] = line.split('saldo(\'')[1].split('\', \'');
      return { id, type };
    })
    .filter((acc: any) => acc.type === '3')
    .map((acc: any) => acc.id);
}

try {
  console.time('bancaribe');
  await login();

  const accounts = await getAccounts();
  const movements = await Promise.all(
    accounts.map(acc => getMovements(acc))
  );
  const movementsFlat = movements.flat();
  const movementsTotal = movements.reduce((acc, mov) => acc + mov.length, 0);

  console.log(movementsFlat, movementsTotal);

  fs.writeFileSync('./movements.json', JSON.stringify(movementsFlat, null, 2));
} catch (e) {
  console.log(e);
} finally {
  await logout();
  console.timeEnd('bancaribe');
}
