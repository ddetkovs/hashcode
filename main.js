var fs = require('fs');
function Order(x, y, items) {
    this.location = {
        x: x,
        y: y
    };

    this.items = items.sort(function (a, b) {
        return a - b;
    });
}

var settings = {
    numberOfRows: undefined,
    numberOfColumns: undefined,
    numberOfDrones: undefined,
    deadline: undefined,
    maximumLoad: undefined
};

var data = fs.readFileSync('./redundancy.in', 'utf8');

data = data.split('\n').map(function (line) {
    var pa = line.split(' ').map(function (number) {
        return parseInt(number);
    });

    return pa;
});

var out = fs.createWriteStream('./log3.out');

var line = data.shift();

settings.numberOfRows = line[0];
settings.numberOfColumns = line[1];
settings.numberOfDrones = line[2];
settings.deadline = line[3];
settings.maximumLoad = line[4];

var numberOfProducts = data.shift()[0];
var products = data.shift();
var numberOfWarehouses = data.shift()[0];
var warehouses = [];

for (var i = 0; i < numberOfWarehouses; i++) {
    line = data.shift();
    var warehouse = {
        location: {
            x: line[0],
            y: line[1]
        }
    };
    warehouse.inventory = data.shift();
    warehouses.push(warehouse);
}

function Drone(id, x, y) {
    this.location = {
        x: x,
        y: y
    };

    this.id = id;

    this.inventory = [];

    for(var i = 0; i < numberOfProducts; i++){
        this.inventory.push(0);
    }

    this.weight = 0;

    this.timeToCompleteTask = 0;
}

Drone.prototype = {
    canLoadItem: function (item) {
        var itemWeight = products[item];
        return settings.maximumLoad - this.weight > itemWeight;
    },
    loadItem: function (warehouseId, itemId, count) {
        var warehouse = warehouses[warehouseId]
        this.weight += products[itemId] * count;
        this.inventory[itemId] += count;
        this.timeToCompleteTask++;
        warehouse.inventory[itemId] -= count;
        out.write(this.id + ' L ' + warehouseId + ' ' + itemId + ' ' + count + '\n');

        //out.end();
        //console.log(this.id + ' L ' + warehouseId + ' ' + itemId + ' ' + count + '\n');
        this.move(warehouse.location);
    },
    move: function (location) {
        this.timeToCompleteTask += calculateTime(
            location.x,
            location.y,
            this.location.x,
            this.location.y);
        this.location = location;
    },
    deliverOrder: function (orderId) {
        var order = orders[orderId];

        var undeliveredItems = [];
        var differentItems = {};

        this.move(order.location);
        var that = this;

        for (var i = 0; i < order.items.length; i++) {
            var itemId = order.items[i];
            if (this.canDeliverItem(itemId)) {
                if (differentItems[itemId]) {
                    differentItems[itemId]++;
                } else {
                    differentItems[itemId] = 1;
                }
                this.unloadItem(order.items[i]);
            } else {
                undeliveredItems.push(order.items[i]);
            }
        }

        Object.keys(differentItems).forEach(function (itemId) {
            var count = differentItems[itemId]
            out.write(that.id + ' D ' + orderId + ' ' + itemId + ' ' + count + '\n');
            //console.log(that.id + ' D ' + orderId + ' ' + itemId + ' ' + count + '\n');
        });

        order.items = undeliveredItems;

        this.timeToCompleteTask += Object.keys(differentItems).length;
    },
    unloadItem: function (item) {
        this.weight -= products[item];
        this.inventory[item]--;
    },
    canDeliverItem: function (item) {
        return this.inventory[item] > 0;
    },
    step: function () {
        if (this.timeToCompleteTask > 0) {
            this.timeToCompleteTask--;
            return;
        }

        var that = this;

        var bestOrderFromWarehouse = orders.reduce(function (bestOrder, order, orderId) {

            var bestWarehouse = warehouses.reduce(function (bestWarehouse, warehouse, warehouseId) {
                var distance = calculateTime(
                    that.location.x,
                    that.location.y,
                    warehouse.location.x,
                    warehouse.location.y);

                distance += calculateTime(
                    warehouse.location.x,
                    warehouse.location.y,
                    order.location.x,
                    order.location.y
                );

                var types = {};
                var maxWeight = order.items.reduce(function (weight, itemId) {
                    if (warehouse.inventory[itemId] > 0) {
                        var newWeight = weight + warehouse.inventory[itemId];
                        if (newWeight <= settings.maximumLoad) {
                            if (!types[itemId]) {
                                distance += 2;
                                types[itemId] = 1;
                            } else {
                                types[itemId]++;
                            }
                            return newWeight;
                        }
                    }
                    return weight;
                }, 0);

                var score;
                if (maxWeight === 0){
                    score = 0;
                }else {
                    score = distance / maxWeight;
                }

                return (bestWarehouse.score > score) ?
                    bestWarehouse :
                {score: score, warehouseId: warehouseId, types: types};
            }, {score: 0, warehouseId: 0, types: {}});

            return (bestWarehouse.score > bestOrder.score) ? {
                score: bestWarehouse.score,
                orderId: orderId,
                warehouseId: bestWarehouse.warehouseId,
                types: bestWarehouse.types
            } : bestOrder;

        }, {score: 0, orderId: 0, warehouseId: 0, types: {}})

        Object.keys(bestOrderFromWarehouse.types)
            .forEach(function (itemId) {
                that.loadItem(
                    bestOrderFromWarehouse.warehouseId,
                    itemId,
                    bestOrderFromWarehouse.types[itemId]);
            });

        that.deliverOrder(bestOrderFromWarehouse.orderId);
    }
};

var drones = [];
for(var i = 0; i < settings.numberOfDrones; i++){
    drones.push(new Drone(i, warehouses[0].x, warehouses[0].y));
}


var orders = [];
var numberOfOrders = data.shift()[0];

for (var i = 0; i < numberOfOrders; i++) {
    line = data.shift();
    var row = line[0];
    var column = line[1];

    data.shift();
    var items = data.shift();

    orders.push(new Order(row, column, items));
}

function calculateTime(x1, y1, x2, y2) {
    return Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2));
}

var time = 0;

while (time < settings.deadline) {
    drones.forEach(function (drone) {
        drone.step();
    });
    var remainingOrders = orders.filter(function (order) {
        return order.items.length > 0
    });

    if(!remainingOrders.length){
        break;
    }

    time++;
}

