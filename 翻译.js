const BaiduTranslate = require('baidu-translate');
const promiseRetry = require('promise-retry');
const dotenv = require('dotenv');
const fs = require('fs-jetpack');
const path = require('path');
const _ = require('lodash');

const translate = new BaiduTranslate(process.env.TRANSLATION_APP_ID, process.env.TRANSLATION_SECRET, 'zh', 'en');

function tryTranslation(value) {
  if (typeof value !== 'string') return Promise.resolve(value);
  if (!value) return Promise.resolve('');
  let lastResult = 'null';
  let retryCount = 0;

  return promiseRetry(
    (retry, number) =>
      translate(value)
        .then(({ trans_result: result }) => {
          if (result && result.length > 0) {
            const [{ dst }] = result;
            return dst;
          }
          lastResult = result;
          retryCount = number;
          retry();
        })
        .catch(() => {
          retryCount = number;
          retry();
        }),
    { retries: 100, maxTimeout: 10000, randomize: true }
  ).catch((error) => {
    return `Translation Error: ${error} result: ${lastResult}, From: ${value}, Count: ${retryCount}\nRetry Again\n--\n\n `;
  });
}

/**
 * 读取原始文件内容，打平成一维数组，并带上路径信息
 */
function readSourceFiles() {
  const sourceModDir = 'Arcana';
  const folders = fs.inspectTree(sourceModDir);
  const foldersWithContent = getFileJSON(folders);
  return foldersWithContent;
}

/**
 * 递归把文件内容塞进文件树里
 * @param {Object} inspectData https://www.npmjs.com/package/fs-jetpack#inspecttreepath-options
 * @param {string | undefined} parentPath 用于拼凑 filePath 用的父级路径
 */
function getFileJSON(inspectData, parentPath = '') {
  const filePath = path.join(parentPath, inspectData.name);
  if (inspectData.type === 'file' && inspectData.name.endsWith('json')) {
    return { ...inspectData, content: JSON.parse(fs.read(filePath)), filePath };
  }
  if (inspectData.type === 'dir') {
    return _.compact(inspectData.children.flatMap((item) => getFileJSON(item, filePath)));
  }
}

/**
 * 把处理过的结果写到 CN mod 文件夹里
 * @param {Object[]} foldersWithContent 一维数组，基本类似于 inspectData https://www.npmjs.com/package/fs-jetpack#inspecttreepath-options ，但是多了 content 包含 JSON parse 过的文件内容，以及 filePath 是完整的原始文件路径
 */
function writeToCNMod(foldersWithContent) {
  for (const inspectDataWithContent of foldersWithContent) {
    const newFilePath = inspectDataWithContent.filePath.replace('Arcana/', 'Arcana_CN/');
    fs.write(newFilePath, JSON.stringify(inspectDataWithContent.content, undefined, '  '));
  }
}

const translators = {};
/**
 *
 * @param {Object} fileItem 基本类似于 inspectData https://www.npmjs.com/package/fs-jetpack#inspecttreepath-options ，但是多了 content 包含 JSON parse 过的文件内容
 */
function translateStringsInContent(fileItem) {
  if (Array.isArray(fileItem.content)) {
    // 文件的内容一般是一维数组
    for (const item of fileItem.content) {
      const translator = translators[item.type];
      if (!translator) {
        console.warn(`没有 ${item.type} 的翻译器`);
      } else {
        translator(item);
      }
    }
    return fileItem;
  } else {
    console.warn(`File content is not an array! ${fileItem.filePath}`);
  }
}

translators.profession = (item) => {
  item.name = '000';
  item.description = '111';
};

writeToCNMod(readSourceFiles().map(translateStringsInContent));
