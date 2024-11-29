import os
import re
import pandas as pd
import matplotlib.pyplot as plt
from datetime import datetime
from flask import Flask, request, render_template, redirect, url_for, flash, send_file
from io import BytesIO
import base64

app = Flask(__name__)
app.secret_key = 'your_secret_key'

directory_path = 'uploads'
plot_buffer = None

if not os.path.exists(directory_path):
    os.makedirs(directory_path)


# Extract data from all txt files in the directory
def extract_data_from_files(directory_path):
    data = []
    for filename in os.listdir(directory_path):
        if filename.endswith('.txt'):
            filepath = os.path.join(directory_path, filename)
            with open(filepath, 'r') as file:
                content = file.read()

                # Extracting fields using regex
                date_match = re.search(r"Date\s*:\s*(\d{4}-\d{2}-\d{2})", content)
                time_match = re.search(r"Time\s*:\s*([\d:]+)", content)
                device_match = re.search(r"Device\s*:\s*(\w+)", content)
                scan_rate_match = re.search(r"Scan Rate\s*\(V/s\)\s*:\s*([\d.]+)", content)
                gate_voltage_match = re.search(r"\[Gate Settings\]\s*Start \(V\)\s*:\s*([\d.]+)", content)

                if date_match and time_match and device_match:
                    date_str = date_match.group(1)
                    time_str = time_match.group(1)
                    datetime_str = f"{date_str} {time_str}"
                    datetime_obj = datetime.strptime(datetime_str, "%Y-%m-%d %H:%M:%S")

                    data_entry = {
                        "Datetime": datetime_obj,
                        "Device": device_match.group(1),
                        "ScanRate": float(scan_rate_match.group(1)) if scan_rate_match else None,
                        "GateVoltage": float(gate_voltage_match.group(1)) if gate_voltage_match else None
                    }
                    data.append(data_entry)

    df = pd.DataFrame(data)
    return df


# Plotting the data
def plot_data(df, parameter):
    try:
        if df.empty:
            print("DataFrame is empty after sorting. No data to plot.")
            return None, None

        df_sorted = df.sort_values(by=["Datetime", parameter])

        plt.figure(figsize=(12, 8))
        plt.plot(df_sorted["Datetime"], df_sorted[parameter], marker='o', linestyle='-', color='b',
                 label=f'{parameter} over Time')
        plt.xticks(rotation=45)
        plt.xlabel('Datetime')
        plt.ylabel(parameter)
        plt.title(f'{parameter} vs Time')
        plt.legend()
        plt.grid(True)
        plt.tight_layout()

        buf = BytesIO()
        plt.savefig(buf, format="png")
        buf.seek(0)
        plot_data = base64.b64encode(buf.getvalue()).decode('utf8')
        plt.close()
        return plot_data, buf
    except Exception as e:
        print(f"An error occurred while plotting: {e}")
        return None, None


@app.route('/', methods=['GET', 'POST'])
def index():
    if request.method == 'POST':
        name = request.form['name']
        flash(f'Welcome, {name}!')
        return redirect(url_for('main_page', username=name))
    return render_template('index.html')


@app.route('/main', methods=['GET', 'POST'])
def main_page():
    global plot_buffer
    plot_url = None
    username = request.args.get('username', 'User')

    if request.method == 'POST':
        if 'file' in request.files:
            file = request.files['file']
            if file and file.filename != '':
                filepath = os.path.join(directory_path, file.filename)
                file.save(filepath)
                flash(f'File "{file.filename}" uploaded successfully and ready for plotting.', 'info')
        elif 'parameter' in request.form:
            parameter = request.form['parameter']
            df = extract_data_from_files(directory_path)

            if df.empty:
                flash('No data found after extraction. Please upload valid data files.', 'danger')
                return render_template('main.html', plot_url=plot_url, username=username)

            if parameter not in df.columns or df[parameter].isnull().all():
                flash(f'Parameter "{parameter}" is not available or has no valid data in the uploaded files.', 'danger')
                return render_template('main.html', plot_url=plot_url, username=username)

            plot_url, plot_buffer = plot_data(df, parameter)
            if plot_url:
                flash('Plot generated successfully.', 'success')
            else:
                flash('An error occurred while generating the plot. Please check the logs.', 'danger')

    return render_template('main.html', plot_url=plot_url, username=username)


@app.route('/download', methods=['GET'])
def download_plot():
    global plot_buffer
    if plot_buffer:
        return send_file(BytesIO(plot_buffer.getvalue()), as_attachment=True, attachment_filename='plot.png',
                         mimetype='image/png')
    else:
        flash('No plot available for download.', 'danger')
        return redirect(url_for('main_page'))


if __name__ == '__main__':
    app.run(debug=True)
