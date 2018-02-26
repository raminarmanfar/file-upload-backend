var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
mongoose.connect('mongodb://127.0.0.1/gridfsFiles');
var conn = mongoose.connection;
var multer = require('multer');
var GridFsStorage = require('multer-gridfs-storage');
var Grid = require('gridfs-stream');
Grid.mongo = mongoose.mongo;
var gfs = Grid(conn.db);
var del = require('del');


/** Seting up server to accept cross-origin browser requests */
app.use(function (req, res, next) { //allow cross origin requests
    res.setHeader("Access-Control-Allow-Methods", "POST, PUT, OPTIONS, DELETE, GET");
    res.header("Access-Control-Allow-Origin", "http://localhost:4200");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Credentials", true);
    next();
});

app.use(bodyParser.json());

/** Setting up storage using multer-gridfs-storage */
var storage = GridFsStorage({
    gfs: gfs,
    filename: function (req, file, cb) {
        var datetimestamp = Date.now();
        cb(null, file.fieldname + '-' + datetimestamp + '.' + file.originalname.split('.')[file.originalname.split('.').length - 1]);
    },
    /** With gridfs we can store aditional meta-data along with the file */
    metadata: function (req, file, cb) {
        cb(null, { originalname: file.originalname, description: "my description", categorie: "categorie-1" });
    },
    root: 'ctFiles' //root name for collection to store files into
});

var upload = multer({ //multer settings for single upload
    storage: storage
}).single('file');

var Schema = mongoose.Schema;

var fileSchema = new Schema({
    originalName: String,
    description: String,
    categorie: String,
    path: String
});

var FileRecord = mongoose.model("FileRecord", fileSchema);

var post_upload = multer({ dest: 'uploads/' })

app.post('/post-data', post_upload.single("file"), function (req, res, next) {
    //casting to boolean
    var isNewFile = (req.body.isNewFile == 'true')
    var file = new FileRecord({
        originalName: req.file.originalname,
        description: req.body.description,
        categorie: req.body.categorie,
        path: req.file.path
    })
    if (isNewFile) {        
        file.save(function (error) {
            console.log("file saved");
            res.json({ error_code: 0, err_desc: null });
            if (error) {
                res.json({ error_code: 1, err_desc: err });
                console.error(error);
            }
        })
    } else {
        //Delete old file
        FileRecord.findOne({ _id: req.body._id }, function (err, record) {
            if (err) return handleError(err);
            var path = record.path;
            var path2 = path.replace(/\\/g, "/");
            del([path2]).then(paths => {
                console.log('Files and folders that would be deleted:\n', paths.join('\n'));
            });
        });
        //Update        
        file._id = req.body._id;
        FileRecord.update({_id: req.body._id}, file, function(err, raw) {
            if (err) {
                res.json({ error_code: 1, err_desc: err });
                return;
            }
            res.json({ error_code: 0, err_desc: null });
          });        
    }
});

app.get('/get-files', function (req, res) {
    FileRecord.find({
    }, function (err, files) {
        if (err) {
            console.log(err);
        } else {
            res.json(files);
            return;
        }
    }).select('_id originalName description categorie')
    return;
})


app.get('/get-file/:id', function (req, res) {

    FileRecord.findOne({ _id: req.params.id }, function (err, file) {
        if (err) {
            console.log(err);
        } else {
            res.download(file.path, file.originalName);
            return;
        }
    });

    return;
})

// returns 0 if deleted
var self = this;
app.get('/delete-file/:id', function (req, res) {
   
    FileRecord.findOne({ _id: req.params.id }, function (err, record) {
        console.log(record);
        if (err) return console.log(err);
        var path = record.path;
        console.log(record.path);
        var path2 = path.replace(/\\/g, "/");
        del([path2]).then(paths => {
            console.log('Files and folders that would be deleted:\n', paths.join('\n'));
        });
    });

    FileRecord.findByIdAndRemove(req.params.id, (err, file) => {
        // As always, handle any potential errors:
        if (err) return res.status(500).send(err);
        const response = {
            message: "file successfully deleted",
            id: req.params.id
        };
        return res.status(200).send(response);
    });   
})


/** API path that will upload the files */
app.post('/upload', function (req, res) {
    upload(req, res, function (err) {
        if (err) {
            res.json({ error_code: 1, err_desc: err });
            return;
        }
        res.json({ error_code: 0, err_desc: null });
    });
});

app.get('/file/:filename', function (req, res) {
    gfs.collection('ctFiles'); //set collection name to lookup into

    /** First check if file exists */
    gfs.files.find({ filename: req.params.filename }).toArray(function (err, files) {
        if (!files || files.length === 0) {
            return res.status(404).json({
                responseCode: 1,
                responseMessage: "error"
            });
        }
        /** create read stream */
        var readstream = gfs.createReadStream({
            filename: files[0].filename,
            root: "ctFiles"
        });
        /** set the proper content type */
        res.set('Content-Type', files[0].contentType)
        /** return response */
        return readstream.pipe(res);
    });
});

app.listen('3002', function () {
    console.log('running on 3002...');
});

