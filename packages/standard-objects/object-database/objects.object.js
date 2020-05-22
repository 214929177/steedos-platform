var objectql = require('@steedos/objectql');
const _ = require('underscore');
var objectCore = require('./objects.core.js');
const internalBaseObjects = ['base', 'core'];

function isInternalObjects(name, datasourceName){
    if(_.include(internalBaseObjects, name)){
        return true;
    }

    let objMap = objectql.getSteedosSchema().getObjectMap(name);
    if(objMap && (!objMap.datasourceName || objMap.datasourceName != datasourceName)){
        return true;
    }
    return false;
}

function isRepeatedName(doc) {
    let datasourceName = objectCore.getDataSourceName(doc);
    if(isInternalObjects(doc.name, datasourceName)){
        return true;
    }
    
    var other;
    other = Creator.getCollection("objects").find({
        _id: {
            $ne: doc._id
        },
        // space: doc.space,
        name: doc.name
    }, {
        fields: {
            _id: 1
        }
    });
    if (other.count() > 0) {
        return true;
    }
    return false;
};

function checkName(name){
    if(name.endsWith('__c')){
        name = name.replace("__c", '')
    }
    var reg = new RegExp('^[a-z]([a-z0-9]|_(?!_))*[a-z0-9]$');
    if(!reg.test(name)){
        throw new Error("名称只能包含小写字母、数字，必须以字母开头，不能以下划线字符结尾或包含两个连续的下划线字符");
    }
    if(name.length > 20){
        throw new Error("名称长度不能大于20个字符");
    }
    return true
}

function initObjectPermission(doc){

    let spaceId =  doc.space;
    let psetsAdminId = null;
    let psetsAdmin = Creator.getCollection("permission_set").findOne({space: spaceId, name: 'admin'});
    if(!psetsAdmin){
        psetsAdminId = Creator.getCollection("permission_set").insert({space: spaceId, name: 'admin'});
    }else{
        psetsAdminId = psetsAdmin._id
    }
    let psetsUserId = null;
    let psetsUser = Creator.getCollection("permission_set").findOne({space: spaceId, name: 'user'});
    if(!psetsUser){
        psetsUserId = Creator.getCollection("permission_set").insert({space: spaceId, name: 'user'});
    }else{
        psetsUserId = psetsUser._id;
    }

    Creator.getCollection("permission_objects").insert(Object.assign({}, Creator.getObject("base").permission_set.user, {
        name : "用户",
        permission_set_id : psetsUserId,
        object_name : doc.name,
        space: doc.space
    }));

    Creator.getCollection("permission_objects").insert(Object.assign({}, Creator.getObject("base").permission_set.admin, {
        name : "管理员",
        permission_set_id : psetsAdminId,
        object_name : doc.name,
        space: doc.space
    }));
}

function getObjectName(doc, objectName){
    if(doc.datasource && doc.datasource != 'default'){
        return objectName;
      }else{
        return `${objectName}__c`;
      }
}

Creator.Objects.objects.actions = {
    show_object: {
        label: "Preview",
        visible: true,
        on: "record",
        todo: function (object_name, record_id, item_element) {
            var record = this.record || Creator.getObjectById(record_id);
            if(!record){
                return toastr.error("未找到记录");
            }

            if(record.is_enable === false){
                return toastr.warning("请先启动对象");
            }

            if(record.datasource && record.datasource != 'default'){
                var datasource = Creator.odata.get('datasources', record.datasource, 'is_enable');
                if(!datasource){
                    return toastr.error("未找到数据源");
                }
                if(!datasource.is_enable){
                    return toastr.warning("请先启动数据源");
                }
            }

            var allViews = Creator.odata.query('object_listviews', {$select: '_id', $filter: `(((contains(tolower(object_name),'${record.name}'))) and ((contains(tolower(name),'all'))))`}, true);

            if(allViews && allViews.length > 0){
                Steedos.openWindow(Creator.getRelativeUrl("/app/-/" + record.name + "/grid/" + allViews[0]._id))
            }else{
                Steedos.openWindow(Creator.getRelativeUrl("/app/-/" + record.name + "/grid/all"))
            }


            
        }
    },
    copy_odata: {
        label: "Copy OData URL",
        visible: true,
        on: "record",
        todo: function (object_name, record_id, item_element) {
            var clipboard, o_name, path, record;
            record = this.record || Creator.getObjectById(record_id);
            //enable_api 属性未开放
            if ((record != null ? record.enable_api : void 0) || true) {
                o_name = record != null ? record.name : void 0;
                path = SteedosOData.getODataPath(Session.get("spaceId"), o_name);
                item_element.attr('data-clipboard-text', path);
                if (!item_element.attr('data-clipboard-new')) {
                    clipboard = new Clipboard(item_element[0]);
                    item_element.attr('data-clipboard-new', true);
                    clipboard.on('success', function (e) {
                        return toastr.success('复制成功');
                    });
                    clipboard.on('error', function (e) {
                        toastr.error('复制失败');
                        return console.error("e");
                    });
                    if (item_element[0].tagName === 'LI' || item_element.hasClass('view-action')) {
                        return item_element.trigger("click");
                    }
                }
            } else {
                return toastr.error('复制失败: 未启用API');
            }
        }
    }
}

function allowChangeObject(){
    var config = objectql.getSteedosConfig();
    if(config.tenant && config.tenant.saas){
        return false
    }else{
        return true;
    }
}

function onChangeObjectName(oldName, newDoc){
    //修改字段
    Creator.getCollection("object_fields").update({space: newDoc.space, object: oldName}, {$set: {object: newDoc.name}}, {
        multi: true
    });
    //修改视图
    Creator.getCollection("object_listviews").direct.update({space: newDoc.space, object_name: oldName}, {$set: {object_name: newDoc.name}}, {
        multi: true
    });
    //修改权限
    Creator.getCollection("permission_objects").direct.update({space: newDoc.space, object_name: oldName}, {$set: {object_name: newDoc.name}}, {
        multi: true
    });
    //修改action
    Creator.getCollection("object_actions").direct.update({space: newDoc.space, object: oldName}, {$set: {object: newDoc.name}}, {
        multi: true
    });
    //修改trigger
    Creator.getCollection("object_triggers").direct.update({space: newDoc.space, object: oldName}, {$set: {object: newDoc.name}}, {
        multi: true
    });
    //字段表中的reference_to
    Creator.getCollection("object_fields").update({space: newDoc.space, reference_to: oldName}, {$set: {reference_to: newDoc.name}}, {
        multi: true
    });
}

Creator.Objects.objects.triggers = {
    "before.insert.server.objects": {
        on: "server",
        when: "before.insert",
        todo: function (userId, doc) {
            if(!allowChangeObject()){
                throw new Meteor.Error(500, "已经超出贵公司允许自定义对象的最大数量");
            }
            checkName(doc.name);
            doc.name = getObjectName(doc, doc.name);
            if (isRepeatedName(doc)) {
                throw new Meteor.Error(500, "对象名称不能重复");
            }
            doc.custom = true;
        }
    },
    "after.insert.server.objects": {
        on: "server",
        when: "after.insert",
        todo: function (userId, doc) {
            //新增object时，默认新建一个name字段
            Creator.getCollection("object_fields").insert({
                object: doc.name,
                owner: userId,
                _name: "name",
                label: "名称",
                space: doc.space,
                type: "text",
                required: true,
                index: true,
                searchable: true
            });
            Creator.getCollection("object_listviews").insert({
                name: "all",
                label: "所有",
                space: doc.space,
                owner: userId,
                object_name: doc.name,
                shared: true,
                filter_scope: "space",
                columns: [{field: 'name'}]
            });
            Creator.getCollection("object_listviews").insert({
                name: "recent",
                label: "最近查看",
                space: doc.space,
                owner: userId,
                object_name: doc.name,
                shared: true,
                filter_scope: "space",
                columns:  [{field: 'name'}]
            });
            
            initObjectPermission(doc);
        }
    },
    "before.update.server.objects": {
        on: "server",
        when: "before.update",
        todo: function (userId, doc, fieldNames, modifier, options) {
            if(!allowChangeObject()){
                throw new Meteor.Error(500, "已经超出贵公司允许自定义对象的最大数量");
            }

            if(_.has(modifier.$set, "datasource") && doc.datasource && modifier.$set.datasource != doc.datasource){
                throw new Error("不能修改对象的数据源");
            }

            var ref;
            if ((modifier != null ? (ref = modifier.$set) != null ? ref.name : void 0 : void 0) && doc.name !== modifier.$set.name) {
                checkName(modifier.$set.name);
                modifier.$set.name = getObjectName(doc, modifier.$set.name);
                if (isRepeatedName({_id: doc._id, name: modifier.$set.name, datasource: doc.datasource})) {
                    throw new Meteor.Error(500, "对象名称不能重复");
                }
            }
            if (modifier.$set) {
                modifier.$set.custom = true;
            }
            if (modifier.$unset && modifier.$unset.custom) {
                delete modifier.$unset.custom;
            }
        }
    },
    "after.update.server.objects": {
        on: "server",
        when: "after.update",
        todo: function (userId, doc, fieldNames, modifier, options) {
            var set = modifier.$set || {}
            if(set.name && this.previous.name != doc.name){
                onChangeObjectName(this.previous.name, doc);
            }
        }
    },
    "before.remove.server.objects": {
        on: "server",
        when: "before.remove",
        todo: function (userId, doc) {
            if(!allowChangeObject()){
                throw new Meteor.Error(500, "已经超出贵公司允许自定义对象的最大数量");
            }
            // var documents, object_collections;
            // if (doc.app_unique_id && doc.app_version) {
            //     return;
            // }
            // object_collections = Creator.getCollection(doc.name, doc.space);
            // documents = object_collections.find({}, {
            //     fields: {
            //         _id: 1
            //     }
            // });
            // if (documents.count() > 0) {
            //     throw new Meteor.Error(500, `对象(${doc.name})中已经有记录，请先删除记录后， 再删除此对象`);
            // }
        }
    },
    "after.remove.server.objects": {
        on: "server",
        when: "after.remove",
        todo: function (userId, doc) {

            if(!doc.name.endsWith("__c") && !doc.datasource){
                console.warn('warn: Not remove. Invalid custom object -> ', doc.name);
                return;
            }        

            var e;
            //删除object 后，自动删除fields、actions、triggers、permission_objects
            Creator.getCollection("object_fields").direct.remove({
                object: doc.name,
                space: doc.space
            });
            Creator.getCollection("object_actions").direct.remove({
                object: doc.name,
                space: doc.space
            });
            Creator.getCollection("object_triggers").direct.remove({
                object: doc.name,
                space: doc.space
            });
            Creator.getCollection("permission_objects").direct.remove({
                object_name: doc.name,
                space: doc.space
            });
            Creator.getCollection("object_listviews").direct.remove({
                object_name: doc.name,
                space: doc.space
            });
            //drop collection
            // console.log("drop collection", doc.name);
            // try {
            //     //					Creator.getCollection(doc.name)._collection.dropCollection()
            //     return Creator.Collections[doc.name]._collection.dropCollection();
            // } catch (error) {
            //     e = error;
            //     console.error(doc.name, `${e.stack}`);
            //     throw new Meteor.Error(500, `对象(${doc.name})不存在或已被删除`);
            // }
        }
    },
    // "after.update.server.dynamic_load": {
    //     on: "server",
    //     when: "after.update",
    //     todo: function (userId, doc, fieldNames, modifier, options) {
    //         loadObject(doc);
    //     }
    // }

}