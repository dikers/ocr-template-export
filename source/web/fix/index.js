var POST_URL = "https://7imr48wed1.execute-api.cn-northwest-1.amazonaws.com.cn/prod/ocr"

var CMD_SAVE_TEMPLATE = 'save_template'   // 保存模板的请求命令
var CMD_GET_FIELD_LIST = 'get_field_list' //  获取一个模板所有的字段
var CMD_GET_TEMPLATE_LIST = 'get_template_list'   //或者特定类型的模板列表
var MIN_KEY_BLOCK_COUNT = 3 //一个模板最少的定位元素

var page_width=960;  // 页面宽度
var page_height=1200;  // 页面高度
var matrix = [1,0,0,1];  //矩阵
var blockItemList ;  // 当前页面已经解析的元素
/**
解析ajax 返回的数据
**/
function parse_data(data){
    blockItemList = new Array();
    pageCount = parseInt(data['DocumentMetadata']['Pages'])
    vue.pageCount = pageCount //当前文档总页数
    vue.data = data   //保存数据
    if (pageCount>0){
        parse_data_by_page(1)  // Demo 展示第一页
    }else {
        show_message("该文档 没有内容")
    }

}

/**
解析单页的数据
**/
function parse_data_by_page(page){
    var data = vue.data
    var blockList = new Array()
    var index = 0
    vue.pageNo = page //当前页码

    //换页时， 清空现在选择的字段。
    clean_current_field()
    // 将所有'行'的元素取出来
    for (i =0 ; i<data['Blocks'].length ; i++){
        if(data['Blocks'][i]['Page'] == page  && data['Blocks'][i]['BlockType']=='LINE'){
            blockList[index] = data['Blocks'][i]
            index++
        }
    }

    // 取出最长的元素， 找到旋转角度， 让它保持水平。
     var max_width_block = find_max_width_block(blockList)
     pointA = max_width_block['Geometry']['Polygon'][0]
     pointB = max_width_block['Geometry']['Polygon'][1]

    tan = (pointB['Y'] - pointA['Y'])/((pointB['X'] - pointA['X']))
    var theta = Math.atan(tan)
    console.log("PageCount=%d,  PageNo=%d,  tan = %f,  theta =   %f   ", vue.pageCount , vue.pageNo, tan, theta)

    //反方向旋转Theta
    matrix = [Math.cos(theta), Math.sin(theta), -1 * Math.sin(theta), Math.cos(theta)]

    /** 显示页面 **/
    var c=document.getElementById("myCanvas");
    var ctx=c.getContext("2d");
    ctx.clearRect(0,0,c.width,c.height);
    blockItemList = new Array()

    //计算旋转后坐标
    var blockCount = blockList.length
//    for(i =0 ; i<1; i++){
    for(i =0 ; i<blockCount; i++){
       blockItem = create_block(blockList[i])
       blockItemList.push(blockItem)
    }


    var page_margin = init_page_margin_block(blockItemList)

    vue.blockItemList = blockItemList
    // 删除空白边缘， 重新绘制元素
    for(i =0 ; i<blockItemList.length; i++){
        var blockItem = blockItemList[i]
        zoom_layout_block(blockItem, page_margin)
        draw_block_inside(ctx, blockItem, 0)
    }

    // 重新加载其它页面已经选取过的元素， 例如加载已经有的模板， 或者翻页。

    redraw_blockItem()
}



/**
计算所有元素经过旋转以后的新坐标
*/
function create_block(block){

    polyList = block['Geometry']['Polygon']
    polyArray = new Array()

    //对坐标按照原点进行旋转
    for(j=0; j<polyList.length; j++){
        //围绕中心点旋转
        ploy = {}
        ploy['x'] = polyList[j]['X'] - 0.5
        ploy['y'] = polyList[j]['Y'] - 0.5
        newPloy = matrix_rotate(matrix, ploy)
        newPloy['x'] =   newPloy['x']+ 0.5
        newPloy['y'] =   newPloy['y']+ 0.5
//        console.log("-------------- %f, %f ", newPloy['x'], newPloy['y'])

        polyArray.push(newPloy)
    }

//    封装block 元素， 供页面显示
    var blockItem = {
        id:block['Id'],
        newPoly:polyArray,
        polyList:block['Geometry']['Polygon'],  // 保存原始左边， 用于计算
        selected:0,  // 是否选中
        blockType:0, // 1 valueBlock;  2 keyBlock
        text:block['Text'],
        x:(polyArray[2]['x'] + polyArray[0]['x']) / 2.0,
        y:(polyArray[2]['y'] + polyArray[0]['y']) / 2.0
        };

    return blockItem
}


/**
删除空白区域以后， 把现有元素等比例放大， 占满空间
*/
function zoom_layout_block(blockItem , page_margin){

        var page_top = page_margin['top']
        var page_left = page_margin['left']
        var polyArray  = blockItem['newPoly']
         for (var i=0; i<polyArray.length; i++){

            var poly = polyArray[i];

            poly['x'] = (poly['x'] -  page_left) * page_margin['width_rate']
            poly['y']  = (poly['y'] -  page_top) * page_margin['height_rate']
         }

        blockItem['width'] = parseInt(page_width * (polyArray[1]['x'] - polyArray[0]['x']))
        blockItem['height'] = parseInt(page_height *(polyArray[3]['y'] - polyArray[0]['y']))
        blockItem['left'] = parseInt(page_width * polyArray[0]['x'])
        blockItem['top'] = parseInt(page_height * polyArray[0]['y'])

}

/**
绘制block
*/
function draw_block_inside(ctx, blockItem){

    ctx.beginPath();
    ctx.clearRect(blockItem['left']-3,blockItem['top']-3,blockItem['width']+6,blockItem['height']+6);
    if(blockItem['selected'] == 1){ // 已经选择
//    blockType
        if(blockItem['blockType'] ==1){  // 值类型
            ctx.strokeStyle="red";
        }else if(blockItem['blockType'] ==2){ // 定位类型元素
            ctx.strokeStyle="green";
        }
    }else {
        ctx.strokeStyle="blue";
    }

    var newPoly = blockItem.newPoly
    ctx.font="10px Arial";
    ctx.lineWidth="1";
    ctx.rect(blockItem['left'],blockItem['top'],blockItem['width'],blockItem['height']);

    ctx.fillText(blockItem['text'],blockItem['left'] +3, blockItem['top']+blockItem['height']/2.0 +2);
    ctx.stroke();

}


function find_max_width_block(blockList){
        var max_width_block = null
        max_width = 0.0
        for(i =0 ; i< blockList.length; i++){
               width =  blockList[i]['Geometry']['BoundingBox']['Width']
               if(width> max_width){
                max_width = width
                max_width_block = blockList[i]
               }
        }
        return max_width_block;
}


/**
找到页面空白的地方， 去除掉， 防止有偏移
**/
function init_page_margin_block(blockList){
        var min_top_block = null
        var page_top = 1
        var page_bottom = 0.0
        var page_left = 1
        var page_right = 0.0

        for(i =0 ; i< blockItemList.length; i++){
               var top =  blockItemList[i]['newPoly'][0]['y']
               if(top<page_top){
                    page_top = top
               }
               var left =  blockItemList[i]['newPoly'][0]['x']
               if(left<page_left){
                  page_left = left
               }

               var bottom =  blockItemList[i]['newPoly'][2]['y']
               if(bottom > page_bottom){
                   page_bottom = bottom
               }

               var right =  blockItemList[i]['newPoly'][2]['x']
               if(right > page_right){
                   page_right = right
               }

        }


        var page_margin ={'top':0, 'bottom':1, 'left':0, 'right':'1'}
        page_margin['top'] = page_top;
        page_margin['bottom'] = page_bottom;
        page_margin['left'] = page_left;
        page_margin['right'] = page_right;


        page_margin['height_rate'] = 1.0/(page_bottom - page_top);
        page_margin['width_rate'] =  1.0/(page_right - page_left)  ;

        console.log("page_margin",  JSON.stringify(page_margin))
        return page_margin;

}