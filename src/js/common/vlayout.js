/**
 * @fileoverview Layout module that supplied split height, resize height features.
 * @author NHN Ent. FE Development Team <dl_javascript@nhnent.com>
 */
'use strict';
var util = global.tui.util,
    mAbs = Math.abs;

var config = require('../config'),
    array = require('./array'),
    common = require('./common'),
    domutil = require('./domutil'),
    domevent = require('./domevent'),
    reqAnimFrame = require('./reqAnimFrame'),
    LinkedList = require('./linkedlist'),
    View = require('../view/view'),
    VPanel = require('./vpanel'),
    Drag = require('../handler/drag');

/**
 * @typedef PanelOptions
 * @type {object}
 * @property {number} [minHeight=0] - minimum height of panel
 * @property {number} [maxHeight] - maximum height of panel. default is container height.
 * @property {number} [height=0] - current panel height
 * @property {boolean} [splitter=false] - is this panel uses splitter?
 * @property {boolean} [autoHeight=false] - is this panel uses remain height of container?
 * @property {string} [className=''] - className string for add created element
 */

/**
 * @constructor
 * @extends {View}
 * @param {object} options - options for VLayout module
 *  @param {PanelOptions[]} [options.panels] - panels to add layout when initialize
 * @param {HTMLElement} container - container element
 */
function VLayout(options, container) {
    var frag;

    if (!(this instanceof VLayout)) {
        return new VLayout(options, container);
    }

    View.call(this, container);

    domutil.addClass(container, config.classname('vlayout-container'));
    
    /**
     * @type {object}
     */
    this.options = util.extend({
        panels: []
    }, options);

    /**
     * @type {LinkedList}
     */
    this._panels = new LinkedList();

    /**
     * @type {Drag}
     */
    this._drag = new Drag({
        distance: 0,
        exclude: function(target) {
            return !domutil.hasClass(target, config.classname('splitter'));
        }
    }, container);

    this._drag.on({
        dragStart: this._onDragStart,
        drag: this._onDrag,
        dragEnd: this._onDragEnd
    }, this);

    /**
     * @type {object}
     */
    this._dragData = null;

    if (this.options.panels.length) {
        frag = document.createDocumentFragment();

        util.forEach(options.panels, function(panelOptions) {
            this.addPanel(panelOptions, frag);
        }, this);

        this.container.appendChild(frag);
    }

    this.refresh();
}

util.inherit(VLayout, View);

/**
 * find index of specific panel that use container to supplied element 
 * @param {HTMLElement} element - html element to find panel
 * @returns {number} index of panel
 */
VLayout.prototype._indexOf = function(element) {
    var index = -1;

    util.forEach(this._panels, function(vPanel, i) {
        if (element === vPanel.container) {
            index = i;
            return false;
        }
    });
    
    return index;
};

/**
 * Initialize resizing guide element
 * @param {HTMLElement} element - element to use guide element after cloned
 * @param {number} top - top pixel value for guide element
 * @returns {HTMLElement} cloned element == guide element
 */
VLayout.prototype._initializeGuideElement = function(element, top) {
    var cloned = element.cloneNode(true);

    domutil.addClass(cloned, config.classname('splitter-guide'));
    this._refreshGuideElement(cloned, top);

    this.container.appendChild(cloned);

    return cloned;
};

/**
 * Refresh guide element position
 * @param {HTMLElement} element - guide element
 * @param {number} top - top pixel value for guide element
 */
VLayout.prototype._refreshGuideElement = function(element, top) {
    element.style.top = top + 'px';
};

/**
 * Clear guide element position
 * @param {HTMLElement} element - guide element
 */
VLayout.prototype._clearGuideElement = function(element) {
    domutil.remove(element);
};


VLayout.prototype._resize = function(splItem, startY, mouseY) {
    var diffY = startY - mouseY,
        resizedHeight = mAbs(diffY),
        resizeMap = {},
        toDown = mouseY > startY,
        traverseMethod = ['prev', 'next'],
        cursor = splItem[traverseMethod[+!toDown]](), 
        resizeTo, panel, height, minHeight, maxHeight,
        panel;

    panel = cursor.data;
    resizeTo = panel.getHeight() + resizedHeight;
    console.log(panel.container.className, resizeTo, '남음: ', resizedHeight);
    resizeMap[panel.id] = [panel, resizeTo];

    while (cursor = cursor[traverseMethod[+toDown]]()) {
        panel = cursor.data;
        
        if (panel.isSplitter()) {
            continue;
        }

        height = panel.getHeight();
        // minHeight = panel.options.minHeight;
        // maxHeight = panel.options.maxHeight;

        resizeTo = Math.max(0, height - resizedHeight);
        resizedHeight -= height;

        console.log(panel.container.className, resizeTo, '남음: ', resizedHeight);

        resizeMap[panel.id] = [panel, resizeTo];

        if (resizedHeight < 0) {
            break;
        }
    }

    console.log(resizeMap);

    reqAnimFrame.requestAnimFrame(function() {
        util.forEach(resizeMap, function(pair) {
            pair[0].setHeight(null, pair[1]);
        });
    });
};

/**********
 * Drag Handlers
 **********/

VLayout.prototype._onDragStart = function(e) {
    var oEvent = e.originEvent,
        target = e.target,
        splID = domutil.getData(target, 'pnid'),
        splItem = this._panels.get(splID),
        splPanel = util.pick(splItem, 'data'),
        splHeight = splPanel.getHeight(),
        splOffsetY = domevent.getMousePosition(oEvent, target)[1],
        mouseY = domevent.getMousePosition(oEvent, this.container)[1],
        guideElement = this._initializeGuideElement(target, mouseY);
        
    splPanel.addClass(config.classname('splitter-focused'));

    this._dragData = {
        splItem: splItem,
        splOffsetY: splOffsetY,
        guideElement: guideElement,
        startY: mouseY - splOffsetY,
        minY: 0,
        maxY: this.getViewBound().height - splHeight
    };

    if (!util.browser.msie) {
        domutil.addClass(document.body, config.classname('resizing'));
    }
};

VLayout.prototype._getMouseY = function(dragData, originEvent) {
    var mouseY = domevent.getMousePosition(originEvent, this.container)[1];

    return common.limit(mouseY - dragData.splOffsetY, [dragData.minY], [dragData.maxY]);
};

VLayout.prototype._onDrag = function(e) {
    var dragData = this._dragData,
        mouseY = this._getMouseY(dragData, e.originEvent);

    this._refreshGuideElement(dragData.guideElement, mouseY);
};

VLayout.prototype._getAsideSplitterHeightSummation = function(splItem) {
    var upper = 0,
        below = 0,
        cursor = splItem,
        unitHeight = splItem.data.getHeight();

    while (cursor = cursor.prev()) {
        if (cursor.data.isSplitter()) {
            upper += unitHeight;
        }
    }

    cursor = splItem;

    while (cursor = cursor.next()) {
        if (cursor.data.isSplitter()) {
            below += unitHeight;
        }
    }

    return [upper, below];
};

VLayout.prototype._onDragEnd = function(e) {
    var dragData = this._dragData,
        asideSplHeights = this._getAsideSplitterHeightSummation(dragData.splItem),
        mouseY = this._getMouseY(dragData, e.originEvent);

    // 스플리터의 이동가능 범위는 다른 스플리터의 높이가 고려되어야 함
    mouseY = common.limit(mouseY, [dragData.minY + asideSplHeights[0]], [dragData.maxY - asideSplHeights[1]]);

    this._resize(dragData.splItem, dragData.startY, mouseY);

    this._dragData = null;
    this._clearGuideElement(dragData.guideElement);
    dragData.splItem.data.removeClass(config.classname('splitter-focused'));
    domutil.removeClass(document.body, config.classname('resizing'));
};

/**********
 * Methods
 **********/

/**
 * refresh each panels
 */
VLayout.prototype.refresh = function() {
    var panelToFillHeight = [],
        usedHeight = 0,
        remainHeight;

    this._panels.each(function(item) {
        var panel = item.data,
            element = panel.container;

        if (domutil.getData(element, 'autoHeight')) {
            panelToFillHeight.push(panel);
        } else {
            usedHeight += panel.getHeight();
        }
    });

    remainHeight = (this.getViewBound().height - usedHeight) / panelToFillHeight.length;

    util.forEach(panelToFillHeight, function(panel) {
        panel.setHeight(null, remainHeight);
    });
};

/**
 * add panel
 * @param {PanelOptions} options - options for panel
 * @param {container} container - container element
 */
VLayout.prototype.addPanel = function(options, container) {
    var element = document.createElement('div'),
        panel = new VPanel(options, element),

    panel = this._panels.add(panel);
    domutil.setData(element, 'pnid', panel.id);

    container.appendChild(element);
};

module.exports = VLayout;

